// HS256 access tokens for the customer-facing /audit surface.
// LabelWatch has no login system in MVP1 — onboarding uses Stripe session_id
// trust. Audit pages use the same one-secret-link philosophy: at the end of
// finalizeOnboarding we mint a long-lived token, email it to the customer,
// and they bookmark `https://label.watch/audit?t=<token>`.
//
// MVP2: magic-link re-issuance flow + httpOnly cookie exchange.

import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TTL_SECONDS = 180 * 24 * 3600; // 180 days

type Payload = { cid: string; iat: number; exp: number };

function getSecret(): string {
  const secret = process.env.LABELWATCH_AUDIT_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "missing or too-short LABELWATCH_AUDIT_TOKEN_SECRET (need >=32 chars)",
    );
  }
  return secret;
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function unb64url(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

export function signAuditToken(
  customerId: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: Payload = { cid: customerId, iat: now, exp: now + ttlSeconds };
  const payloadB64 = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", getSecret()).update(payloadB64).digest();
  return `${payloadB64}.${b64url(sig)}`;
}

export function verifyAuditToken(
  token: string | null | undefined,
): { customerId: string } | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;

  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return null;
  }

  const expectedSig = createHmac("sha256", secret).update(payloadB64).digest();
  const actualSig = unb64url(sigB64);
  if (expectedSig.length !== actualSig.length) return null;
  if (!timingSafeEqual(expectedSig, actualSig)) return null;

  let payload: Payload;
  try {
    payload = JSON.parse(unb64url(payloadB64).toString("utf8")) as Payload;
  } catch {
    return null;
  }
  if (typeof payload.cid !== "string" || !payload.cid) return null;
  if (typeof payload.exp !== "number") return null;
  if (payload.exp * 1000 < Date.now()) return null;
  return { customerId: payload.cid };
}
