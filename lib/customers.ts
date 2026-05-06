// Customer provisioning + onboarding helpers.
// - upsertCustomerSkeleton: called from the Stripe webhook on
//   checkout.session.completed. Creates a `customers` row (or no-ops if one
//   already exists) so nothing is lost if the buyer bounces before /onboard.
// - finalizeOnboarding: called from /api/onboard. Writes profile + channels
//   in one logical step and stamps customers.onboarding_completed_at.
//
// Keeps the race-safe 23505 pattern used elsewhere in this repo (lib/firms.ts,
// app/api/signup/route.ts).
//
// Matcher + delivery MUST filter:
//   WHERE customers.onboarding_completed_at IS NOT NULL
//     AND EXISTS (SELECT 1 FROM customer_channels
//                 WHERE customer_id = customers.id AND enabled = true)

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import type {
  ChannelConfig,
  ChannelType,
  IngredientCategory,
  SeverityPreferences,
  Tier,
} from "@/types/database.types";
import { mintAndEmailAuditAccess } from "./audit-access";
import { appendFirmAliases, findOrCreateFirm } from "./firms";

function tierFromMetadata(meta: Stripe.Metadata | null | undefined): Tier | null {
  const value = (meta?.tier ?? "").toLowerCase();
  if (value === "starter" || value === "pro" || value === "team") return value;
  return null;
}

function resolveFirmNameFromSession(session: Stripe.Checkout.Session): string {
  // Prefer the billing name the buyer actually entered; fall back to email
  // local-part so the column stays NOT NULL even if billing is incomplete.
  const billingName = session.customer_details?.name?.trim();
  if (billingName) return billingName;
  const email = session.customer_details?.email ?? session.customer_email ?? "";
  const local = email.split("@")[0];
  return local || "Unknown";
}

export async function upsertCustomerSkeleton(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<{ customerId: string; created: boolean } | null> {
  // Refuse to provision for sessions that didn't actually pay / enter trial.
  // Trials come through as "no_payment_required"; real charges as "paid".
  // Anything else (notably "unpaid") is an anomaly and should not create a row.
  const paymentStatus = session.payment_status;
  if (paymentStatus !== "paid" && paymentStatus !== "no_payment_required") {
    return null;
  }

  const stripeCustomerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;
  if (!stripeCustomerId) {
    // Stripe may emit checkout.session.completed without a customer for
    // one-off payments. We're subscription-only, so this is an anomaly —
    // return null and let the caller log/ignore.
    return null;
  }

  const email =
    session.customer_details?.email ?? session.customer_email ?? null;
  if (!email) return null;

  const tier = tierFromMetadata(session.metadata);
  if (!tier) return null;

  const firmName = resolveFirmNameFromSession(session);

  const { data: inserted, error: insertError } = await supabase
    .from("customers")
    .insert({
      stripe_customer_id: stripeCustomerId,
      email,
      firm_name: firmName,
      tier,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: existing, error: selectError } = await supabase
        .from("customers")
        .select("id")
        .eq("stripe_customer_id", stripeCustomerId)
        .single();
      if (selectError) {
        throw new Error(`customer re-read failed: ${selectError.message}`);
      }
      return { customerId: existing.id, created: false };
    }
    throw new Error(`customer insert failed: ${insertError.message}`);
  }

  return { customerId: inserted.id, created: true };
}

export type OnboardingSubmission = {
  firmAliases: string[];
  ingredientCategories: IngredientCategory[];
  severityPreferences: SeverityPreferences;
  channel: {
    type: ChannelType;
    config: ChannelConfig;
  };
};

export async function finalizeOnboarding(
  supabase: SupabaseClient,
  stripeCustomerId: string,
  submission: OnboardingSubmission,
): Promise<{ customerId: string; alreadyOnboarded: boolean }> {
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, firm_name, onboarding_completed_at")
    .eq("stripe_customer_id", stripeCustomerId)
    .single();

  if (customerError || !customer) {
    throw new Error(
      `customer not found for stripe_customer_id=${stripeCustomerId}: ${customerError?.message ?? "missing"}`,
    );
  }

  // Idempotent re-submit: if they've already completed onboarding, don't
  // insert another channel (DB constraint would catch it, but short-circuit
  // cleanly rather than rely on 23505).
  if (customer.onboarding_completed_at) {
    return { customerId: customer.id, alreadyOnboarded: true };
  }

  const { firmId } = await findOrCreateFirm(supabase, customer.firm_name);

  // Provenance: customer's submitted aliases on the profile row.
  // Matcher benefit: same aliases appended to the canonical firm row.
  if (submission.firmAliases.length > 0) {
    await appendFirmAliases(supabase, firmId, submission.firmAliases);
  }

  const { error: profileError } = await supabase
    .from("customer_profiles")
    .upsert(
      {
        customer_id: customer.id,
        firm_id: firmId,
        firm_aliases: submission.firmAliases,
        ingredient_categories: submission.ingredientCategories,
        severity_preferences: submission.severityPreferences,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "customer_id" },
    );

  if (profileError) {
    throw new Error(`customer_profiles upsert failed: ${profileError.message}`);
  }

  const { error: channelError } = await supabase
    .from("customer_channels")
    .insert({
      customer_id: customer.id,
      type: submission.channel.type,
      config: submission.channel.config,
      enabled: true,
    });

  if (channelError) {
    // Race: two onboard submissions landed concurrently (unlikely but
    // possible on double-click). DB unique(customer_id, type) protects us;
    // treat as idempotent success and fall through to stamping.
    if (channelError.code !== "23505") {
      throw new Error(
        `customer_channels insert failed: ${channelError.message}`,
      );
    }
  }

  const { error: stampError } = await supabase
    .from("customers")
    .update({
      onboarding_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", customer.id);

  if (stampError) {
    throw new Error(`onboarding stamp failed: ${stampError.message}`);
  }

  // Mint + email the audit-access link. Non-fatal on failure.
  await mintAndEmailAuditAccess(supabase, customer.id);

  return { customerId: customer.id, alreadyOnboarded: false };
}

// Append a delivery channel for an already-onboarded customer. Used by
// /api/account/channels (POST) and the /account-return Slack OAuth callback.
// Bead infrastructure-3mbd.
//
// No unique constraint on (customer_id, type) — customers may have multiple
// channels of the same type (e.g. two Slack workspaces). Idempotency at the
// caller's discretion.
export async function addCustomerChannel(
  supabase: SupabaseClient,
  customerId: string,
  channel: { type: ChannelType; config: ChannelConfig },
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("customer_channels")
    .insert({
      customer_id: customerId,
      type: channel.type,
      config: channel.config,
      enabled: true,
    })
    .select("id")
    .single();
  if (error) {
    throw new Error(`customer_channels insert failed: ${error.message}`);
  }
  return { id: data.id };
}

// Delete a single channel scoped to a customer. Returns rows-deleted so the
// caller can distinguish "deleted" from "no such row / wrong customer".
export async function deleteCustomerChannel(
  supabase: SupabaseClient,
  customerId: string,
  channelId: string,
): Promise<{ deleted: number }> {
  const { error, count } = await supabase
    .from("customer_channels")
    .delete({ count: "exact" })
    .eq("id", channelId)
    .eq("customer_id", customerId);
  if (error) {
    throw new Error(`customer_channels delete failed: ${error.message}`);
  }
  return { deleted: count ?? 0 };
}

// Update the severity_filter on a single channel scoped to a customer.
// Pass null to clear (channel falls back to the customer-level default).
// Bead infrastructure-dxkk.
export async function updateChannelSeverityFilter(
  supabase: SupabaseClient,
  customerId: string,
  channelId: string,
  severityFilter: { min_class: "I" | "II" | "III" } | null,
): Promise<{ updated: number }> {
  const { error, count } = await supabase
    .from("customer_channels")
    .update({ severity_filter: severityFilter }, { count: "exact" })
    .eq("id", channelId)
    .eq("customer_id", customerId);
  if (error) {
    throw new Error(`customer_channels severity_filter update failed: ${error.message}`);
  }
  return { updated: count ?? 0 };
}
