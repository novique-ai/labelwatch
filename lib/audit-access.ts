// Mint + email a long-lived audit-access link to a newly onboarded customer.
// Called from finalizeOnboarding() after onboarding_completed_at is stamped.
// Failure here is non-fatal — onboarding is the priority; we log and move on.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "./resend";
import { signAuditToken } from "./audit-token";

function publicUrl(): string {
  return (process.env.LABELWATCH_PUBLIC_URL || "https://label.watch").replace(
    /\/$/,
    "",
  );
}

function from(): string {
  return process.env.CONTACT_EMAIL_FROM || "LabelWatch <noreply@label.watch>";
}

export async function mintAndEmailAuditAccess(
  supabase: SupabaseClient,
  customerId: string,
): Promise<void> {
  const { data: customer, error } = await supabase
    .from("customers")
    .select("email, firm_name")
    .eq("id", customerId)
    .single();
  if (error || !customer) {
    console.error(
      "audit-access: customer lookup failed",
      customerId,
      error?.message,
    );
    return;
  }

  let token: string;
  try {
    token = signAuditToken(customerId);
  } catch (err) {
    console.error("audit-access: token mint failed", err);
    return;
  }
  const link = `${publicUrl()}/audit?t=${encodeURIComponent(token)}`;

  const text = `Hi ${customer.firm_name},

Your LabelWatch dashboard is live. Bookmark this link — it's your private access:

${link}

From there you can run a Listing Copy Audit: upload your Supplement Facts Panel image, paste your Amazon or brand-site listing copy, and get a flag report on language drift between the two.

If you lose this email, reply and we'll reissue.

— LabelWatch`;

  const result = await sendEmail({
    from: from(),
    to: customer.email,
    subject: "Your LabelWatch dashboard is ready",
    text,
  });
  if (!result.ok) {
    console.error("audit-access: email send failed", customerId, result.error);
  }
}
