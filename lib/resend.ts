// Thin Resend client wrapper. Uses the REST API directly so we don't pull
// in the SDK for one call. Requires RESEND_API_KEY at runtime.

type SendArgs = {
  from: string;
  to: string | string[];
  reply_to?: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
};

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function sendEmail(args: SendArgs): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "missing RESEND_API_KEY" };

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return { ok: false, error: `resend ${resp.status}: ${text.slice(0, 300)}` };
  }
  const data = (await resp.json()) as { id?: string };
  if (!data.id) return { ok: false, error: "resend response missing id" };
  return { ok: true, id: data.id };
}

// RFC-aligned headers that mark a message as high-importance.
// Outlook honors X-Priority + Importance; Gmail surfaces Importance.
export const URGENT_HEADERS: Record<string, string> = {
  "X-Priority": "1",
  "X-MSMail-Priority": "High",
  Importance: "high",
  Priority: "urgent",
};
