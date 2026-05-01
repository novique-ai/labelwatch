// Lightweight customer session — bead infrastructure-5ncn.
//
// MVP1 auth model: an HMAC-signed cookie containing the customer_id. Set
// at /api/onboard success, verified server-side at /account. The cookie
// is the only thing persisting "I am customer X" across visits.
//
// This is NOT real auth: no password, no magic-link, no session expiry.
// It's a soft re-entry pointer for known customers. A bad actor with the
// cookie value can read another customer's dashboard. The Customer
// Portal magic-link (Stripe-issued, sent to the verified email on
// subscription) remains the source of truth for billing actions.
//
// Post-launch (NOT this commit): replace with passwordless email
// magic-link auth (Stripe portal flow + signed token in URL).

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const COOKIE_NAME = "lw_customer";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 days

function getSecret(): string {
  const secret = process.env.CUSTOMER_SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CUSTOMER_SESSION_SECRET not set in production");
    }
    return "dev-only-customer-session-secret-do-not-use-in-prod";
  }
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("hex");
}

export function encodeCustomerCookie(customerId: string): string {
  const sig = sign(customerId);
  return `${customerId}.${sig}`;
}

export function decodeCustomerCookie(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const customerId = raw.slice(0, dot);
  const providedSig = raw.slice(dot + 1);
  if (!/^[0-9a-f]{64}$/.test(providedSig)) return null;
  if (!/^[0-9a-f-]{36}$/.test(customerId)) return null;

  const expectedSig = sign(customerId);
  // timingSafeEqual requires equal-length buffers
  const a = Buffer.from(providedSig, "hex");
  const b = Buffer.from(expectedSig, "hex");
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return customerId;
}

export const CUSTOMER_COOKIE_NAME = COOKIE_NAME;
export const CUSTOMER_COOKIE_MAX_AGE = COOKIE_MAX_AGE_SECONDS;

// Convenience for setting from a Next.js Response. Not used by the API
// route directly — that route writes the Set-Cookie header itself so it
// can fan in with the JSON body. Kept here for symmetry with future code.
export function buildSetCookieHeader(customerId: string): string {
  const value = encodeCustomerCookie(customerId);
  const attrs = [
    `${COOKIE_NAME}=${value}`,
    "Path=/",
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
    "HttpOnly",
  ];
  if (process.env.NODE_ENV === "production") attrs.push("Secure");
  return attrs.join("; ");
}

// One-time, non-secret nonce we hand back at /onboard for tests/diagnostics.
// Not security-relevant.
export function freshNonce(): string {
  return randomBytes(8).toString("hex");
}
