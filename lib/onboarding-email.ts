// Onboarding welcome email — bead infrastructure-cwlm.
//
// One transactional email per new customer, sent on /api/onboard success.
// Replaces the storm of N per-recall alerts the matcher used to emit during
// the 180-day backfill (r7d5 gap #8, 2026-05-01 walkthrough).
//
// This is a transactional email — sent to the Stripe customer's email,
// not through customer_channels. Class designation: not a recall alert.

import { sendEmail } from "@/lib/resend";

const FROM_DEFAULT = "LabelWatch <alerts@label.watch>";

type WelcomeArgs = {
  to: string;
  firmName: string;
  backfillMatched: number;
};

export async function sendOnboardingWelcomeEmail(args: WelcomeArgs): Promise<void> {
  if (!args.to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.to)) {
    console.warn("welcome email skipped: no valid 'to' address");
    return;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.label.watch";
  const historyUrl = `${siteUrl}/history`;

  const matched = args.backfillMatched;
  const matchedLine =
    matched === 0
      ? "We checked the last 180 days of FDA recalls — none matched your watch profile yet. Quiet is good news."
      : matched === 1
        ? "We found 1 recall in the last 180 days that matches your watch profile."
        : `We found ${matched} recalls in the last 180 days that match your watch profile.`;

  const subject = "Welcome to LabelWatch — your watch is live";

  const text = [
    `Welcome to LabelWatch.`,
    ``,
    `Your watch is live. From here on, you'll get one alert per new recall as it publishes — no spam, no digests, no roll-ups.`,
    ``,
    matchedLine,
    matched > 0
      ? `These past matches will appear in your history when /history launches. We didn't email each one — that would be 100s of alerts at signup. Reply to this email if you'd like the list now.`
      : ``,
    ``,
    `Manage your subscription via the link in your Stripe receipt email.`,
    ``,
    `— LabelWatch`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const html = `
<div style="font-family: system-ui, sans-serif; max-width: 560px; line-height: 1.6; color: #1a1a1a;">
  <h2 style="margin: 0 0 20px; font-size: 22px; font-weight: 600;">Welcome to LabelWatch</h2>
  <p style="margin: 0 0 16px;">Your watch is live. From here on, you'll get one alert per new recall as it publishes — no spam, no digests, no roll-ups.</p>
  <p style="margin: 0 0 16px; padding: 16px; background: #f5f3ee; border-left: 3px solid #c63a1f;">
    ${escapeHtml(matchedLine)}
    ${
      matched > 0
        ? `<br><span style="color: #666; font-size: 14px;">These past matches will appear in your history when <a href="${escapeHtmlAttr(historyUrl)}" style="color: #c63a1f;">/history</a> launches. We didn't email each one — that would be 100s of alerts at signup. Reply to this email if you'd like the list now.</span>`
        : ""
    }
  </p>
  <p style="margin: 24px 0 0; font-size: 14px; color: #666;">Manage your subscription via the link in your Stripe receipt email.</p>
  <p style="margin: 32px 0 0; font-size: 13px; color: #999;">— LabelWatch</p>
</div>`.trim();

  const result = await sendEmail({
    from: FROM_DEFAULT,
    to: args.to,
    subject,
    text,
    html,
  });

  if (!result.ok) {
    throw new Error(`welcome email send failed: ${result.error}`);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttr(s: string): string {
  return escapeHtml(s);
}
