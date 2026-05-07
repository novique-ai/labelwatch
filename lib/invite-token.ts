// HMAC-signed invite tokens for Team org seat invitations.
// Mirrors lib/audit-token.ts. Format: <payloadB64url>.<sigB64url>
// Payload carries org_id + email so a token cannot be redirected to a
// different org or accepted by a different recipient.
//
// Bead infrastructure-cin7.

import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TTL_SECONDS = 7 * 24 * 3600; // 7 days

type InvitePayload = {
  org_id: string;
  email: string;
  iat: number;
  exp: number;
};

function getSecret(): string {
  const secret = process.env.LABELWATCH_INVITE_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "missing or too-short LABELWATCH_INVITE_TOKEN_SECRET (need >=32 chars)",
    );
  }
  return secret;
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function unb64url(s: string): Buffer {
  const padded =
    s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

export function signInviteToken(
  orgId: string,
  email: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: InvitePayload = {
    org_id: orgId,
    email: email.toLowerCase(),
    iat: now,
    exp: now + ttlSeconds,
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", getSecret()).update(payloadB64).digest();
  return `${payloadB64}.${b64url(sig)}`;
}

export function verifyInviteToken(
  token: string | null | undefined,
): { orgId: string; email: string } | null {
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

  let payload: InvitePayload;
  try {
    payload = JSON.parse(unb64url(payloadB64).toString("utf8")) as InvitePayload;
  } catch {
    return null;
  }
  if (typeof payload.org_id !== "string" || !payload.org_id) return null;
  if (typeof payload.email !== "string" || !payload.email) return null;
  if (typeof payload.exp !== "number") return null;
  if (payload.exp * 1000 < Date.now()) return null;

  return { orgId: payload.org_id, email: payload.email };
}
