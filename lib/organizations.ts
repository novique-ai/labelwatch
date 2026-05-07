// Organization, membership, and invitation helpers — bead infrastructure-cin7.
// Team tier only. All functions use the service-role Supabase client.

import type { SupabaseClient } from "@supabase/supabase-js";
import { TEAM_MAX_SEATS } from "./tier-limits";

export { TEAM_MAX_SEATS };

export type OrgRow = {
  id: string;
  name: string;
  owner_customer_id: string;
  created_at: string;
};

export type MembershipRow = {
  id: string;
  organization_id: string;
  customer_id: string;
  role: "owner" | "admin" | "member";
  invited_by: string | null;
  accepted_at: string;
  created_at: string;
  // Joined from customers (nullable — member row may be deleted):
  customer?: { email: string; firm_name: string } | null;
};

export type InvitationRow = {
  id: string;
  organization_id: string;
  email: string;
  role: "owner" | "admin" | "member";
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

// Create an org + owner membership in one logical step.
// Called from finalizeOnboarding when tier = 'team'. Idempotent: if an org
// already exists for this owner, returns the existing org_id.
export async function createOrgForOwner(
  supabase: SupabaseClient,
  ownerCustomerId: string,
  orgName: string,
): Promise<string> {
  // Check if org already exists for this owner (idempotent re-onboard).
  const { data: existing } = await supabase
    .from("organizations")
    .select("id")
    .eq("owner_customer_id", ownerCustomerId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: orgName, owner_customer_id: ownerCustomerId })
    .select("id")
    .single();
  if (orgError) {
    // Race: concurrent finalizeOnboarding call beat us to it.
    if (orgError.code === "23505") {
      const { data: raced } = await supabase
        .from("organizations")
        .select("id")
        .eq("owner_customer_id", ownerCustomerId)
        .maybeSingle();
      if (raced) return raced.id;
    }
    throw new Error(`organizations insert failed: ${orgError.message}`);
  }

  // Insert owner membership row.
  const { error: memberError } = await supabase.from("memberships").insert({
    organization_id: org.id,
    customer_id: ownerCustomerId,
    role: "owner",
  });
  if (memberError && memberError.code !== "23505") {
    throw new Error(`owner membership insert failed: ${memberError.message}`);
  }

  return org.id;
}

// Find the org for a given customer (either as owner or as a member).
// Returns null if the customer is not part of any org.
export async function getOrgForCustomer(
  supabase: SupabaseClient,
  customerId: string,
): Promise<OrgRow | null> {
  // Check if this customer is an owner.
  const { data: ownedOrg } = await supabase
    .from("organizations")
    .select("id, name, owner_customer_id, created_at")
    .eq("owner_customer_id", customerId)
    .maybeSingle<OrgRow>();
  if (ownedOrg) return ownedOrg;

  // Check if this customer is a member (organization_id on customers row).
  const { data: customerRow } = await supabase
    .from("customers")
    .select("organization_id")
    .eq("id", customerId)
    .maybeSingle<{ organization_id: string | null }>();
  if (!customerRow?.organization_id) return null;

  const { data: memberOrg } = await supabase
    .from("organizations")
    .select("id, name, owner_customer_id, created_at")
    .eq("id", customerRow.organization_id)
    .maybeSingle<OrgRow>();
  return memberOrg ?? null;
}

// List all accepted members of an org, joined with customer display fields.
export async function listOrgMembers(
  supabase: SupabaseClient,
  orgId: string,
): Promise<MembershipRow[]> {
  const { data, error } = await supabase
    .from("memberships")
    .select("id, organization_id, customer_id, role, invited_by, accepted_at, created_at, customer:customers!customer_id(email, firm_name)")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`memberships fetch failed: ${error.message}`);
  return (data ?? []) as unknown as MembershipRow[];
}

// Count accepted (non-expired, active) memberships for an org.
export async function countOrgMembers(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  if (error) throw new Error(`memberships count failed: ${error.message}`);
  return count ?? 0;
}

// List pending (un-accepted, not expired) invitations for an org.
export async function listPendingInvitations(
  supabase: SupabaseClient,
  orgId: string,
): Promise<InvitationRow[]> {
  const { data, error } = await supabase
    .from("invitations")
    .select("id, organization_id, email, role, token, expires_at, accepted_at, created_at")
    .eq("organization_id", orgId)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw new Error(`invitations fetch failed: ${error.message}`);
  return (data ?? []) as InvitationRow[];
}

// Create a slim member customers row when an invite is accepted.
// No Stripe subscription, no customer_profiles/channels — member is read-only.
// Sets onboarding_completed_at = now() so the member can access /account.
// Returns the new customers.id.
export async function createMemberCustomer(
  supabase: SupabaseClient,
  email: string,
  orgId: string,
): Promise<string> {
  const firmName = email.split("@")[0] || email;
  const { data, error } = await supabase
    .from("customers")
    .insert({
      email,
      firm_name: firmName,
      tier: "team",
      organization_id: orgId,
      onboarding_completed_at: new Date().toISOString(),
      // stripe_customer_id intentionally omitted (NULL) — members have no sub
    })
    .select("id")
    .single();
  if (error) throw new Error(`member customers insert failed: ${error.message}`);
  return data.id;
}
