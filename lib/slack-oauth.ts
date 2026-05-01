// Slack OAuth helpers — bead infrastructure-e1pt.
//
// MVP1 model: customer onboarding picks "Slack" as channel type → clicks
// "Connect Slack" → redirected to slack.com/oauth/v2/authorize → after
// approval, Slack redirects to /api/slack/oauth/callback with a code →
// we exchange code for an incoming-webhook URL → we stash it in a
// signed HttpOnly cookie that /api/onboard reads at form-submit time.
//
// We never store the bot access_token; only the incoming_webhook.url
// (same shape as the existing manual-paste flow). The slack adapter
// (lib/adapters/slack.ts) is unchanged.
//
// Two cookies:
//   lw_slack_state — short-lived nonce + session_id, prevents CSRF on the OAuth dance
//   lw_slack_oauth — webhook_url + channel + team metadata after successful auth,
//                    consumed by /api/onboard then cleared

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const STATE_COOKIE = "lw_slack_state";
const OAUTH_COOKIE = "lw_slack_oauth";
const STATE_TTL_SECONDS = 600;   // 10 min — covers slow Slack auth pages
const OAUTH_TTL_SECONDS = 1800;  // 30 min — generous buffer between callback and form submit

function getSecret(): string {
  const s = process.env.CUSTOMER_SESSION_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CUSTOMER_SESSION_SECRET not set");
    }
    return "dev-only-customer-session-secret-do-not-use-in-prod";
  }
  return s;
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("hex");
}

// State cookie: nonce + session_id. We don't strictly need the nonce since
// we sign the whole payload, but it makes replay protection explicit.
type StatePayload = { nonce: string; sessionId: string; createdAt: number };

export function encodeStateCookie(sessionId: string): { value: string; nonce: string } {
  const nonce = randomBytes(16).toString("hex");
  const payload: StatePayload = { nonce, sessionId, createdAt: Math.floor(Date.now() / 1000) };
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, "utf8").toString("base64url");
  const sig = sign(b64);
  return { value: `${b64}.${sig}`, nonce };
}

export function decodeStateCookie(raw: string | undefined | null): StatePayload | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const b64 = raw.slice(0, dot);
  const providedSig = raw.slice(dot + 1);
  if (!/^[0-9a-f]{64}$/.test(providedSig)) return null;

  const expectedSig = sign(b64);
  const a = Buffer.from(providedSig, "hex");
  const b = Buffer.from(expectedSig, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof payload.nonce !== "string" || typeof payload.sessionId !== "string") return null;
  if (typeof payload.createdAt !== "number") return null;
  const ageSec = Math.floor(Date.now() / 1000) - payload.createdAt;
  if (ageSec > STATE_TTL_SECONDS || ageSec < -60) return null;

  return payload;
}

// OAuth-result cookie: webhook URL + display metadata, signed.
export type SlackOAuthPayload = {
  sessionId: string;
  webhookUrl: string;
  channel: string;     // e.g. "#general"
  teamName: string;    // e.g. "Acme Workspace"
  configurationUrl: string;
  createdAt: number;
};

export function encodeOAuthCookie(payload: Omit<SlackOAuthPayload, "createdAt">): string {
  const full: SlackOAuthPayload = { ...payload, createdAt: Math.floor(Date.now() / 1000) };
  const b64 = Buffer.from(JSON.stringify(full), "utf8").toString("base64url");
  const sig = sign(b64);
  return `${b64}.${sig}`;
}

export function decodeOAuthCookie(raw: string | undefined | null): SlackOAuthPayload | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const b64 = raw.slice(0, dot);
  const providedSig = raw.slice(dot + 1);
  if (!/^[0-9a-f]{64}$/.test(providedSig)) return null;

  const expectedSig = sign(b64);
  const a = Buffer.from(providedSig, "hex");
  const b = Buffer.from(expectedSig, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: SlackOAuthPayload;
  try {
    payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof payload.sessionId !== "string") return null;
  if (typeof payload.webhookUrl !== "string" || !payload.webhookUrl.startsWith("https://hooks.slack.com/")) {
    return null;
  }
  if (typeof payload.createdAt !== "number") return null;
  const ageSec = Math.floor(Date.now() / 1000) - payload.createdAt;
  if (ageSec > OAUTH_TTL_SECONDS || ageSec < -60) return null;

  return payload;
}

export function buildStateCookieHeader(value: string): string {
  const attrs = [
    `${STATE_COOKIE}=${value}`,
    "Path=/",
    `Max-Age=${STATE_TTL_SECONDS}`,
    "SameSite=Lax",
    "HttpOnly",
  ];
  if (process.env.NODE_ENV === "production") attrs.push("Secure");
  return attrs.join("; ");
}

export function buildOAuthCookieHeader(value: string): string {
  const attrs = [
    `${OAUTH_COOKIE}=${value}`,
    "Path=/",
    `Max-Age=${OAUTH_TTL_SECONDS}`,
    "SameSite=Lax",
    "HttpOnly",
  ];
  if (process.env.NODE_ENV === "production") attrs.push("Secure");
  return attrs.join("; ");
}

// Clear cookie (Max-Age=0)
export function clearCookieHeader(name: string): string {
  return `${name}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly${
    process.env.NODE_ENV === "production" ? "; Secure" : ""
  }`;
}

export const SLACK_STATE_COOKIE_NAME = STATE_COOKIE;
export const SLACK_OAUTH_COOKIE_NAME = OAUTH_COOKIE;

// Slack OAuth endpoint helpers
export function buildAuthorizeUrl(state: string): string {
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) throw new Error("SLACK_CLIENT_ID not set");
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.label.watch";
  const params = new URLSearchParams({
    client_id: clientId,
    scope: "incoming-webhook",
    redirect_uri: `${origin}/api/slack/oauth/callback`,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

type SlackOAuthExchangeResponse = {
  ok: boolean;
  error?: string;
  team?: { id: string; name: string };
  incoming_webhook?: {
    channel: string;
    channel_id: string;
    configuration_url: string;
    url: string;
  };
};

export async function exchangeCodeForWebhook(code: string): Promise<SlackOAuthExchangeResponse> {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { ok: false, error: "SLACK_CLIENT_ID or SLACK_CLIENT_SECRET not set" };
  }
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.label.watch";

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: `${origin}/api/slack/oauth/callback`,
  });

  const resp = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  return (await resp.json()) as SlackOAuthExchangeResponse;
}
