// API key generation and verification — bead infrastructure-2mkx.
// Keys are long-lived Bearer tokens for Team org programmatic access.
//
// Format:  lw_<64-hex-random>  (67 chars)
// Storage: SHA-256 hex hash stored in api_keys.key_hash. Plaintext shown once.
// Lookup:  hash incoming key → SELECT WHERE key_hash = hash AND revoked_at IS NULL
//          → update last_used_at → return { orgId, ownerCustomerId }

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const KEY_PREFIX = "lw_";

export function generateApiKey(): { key: string; hash: string } {
  const key = KEY_PREFIX + randomBytes(32).toString("hex");
  return { key, hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export type ApiKeyVerified = {
  keyId: string;
  orgId: string;
  ownerCustomerId: string;
};

// Verify a raw Bearer token. Returns the org's owner_customer_id on success.
// Updates last_used_at as a side-effect (best-effort, non-fatal).
export async function verifyApiKey(
  supabase: SupabaseClient,
  rawKey: string,
): Promise<ApiKeyVerified | null> {
  if (!rawKey?.startsWith(KEY_PREFIX)) return null;

  const hash = hashApiKey(rawKey);

  const { data: keyRow } = await supabase
    .from("api_keys")
    .select("id, organization_id")
    .eq("key_hash", hash)
    .is("revoked_at", null)
    .maybeSingle<{ id: string; organization_id: string }>();
  if (!keyRow) return null;

  // Fetch org's owner_customer_id.
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("owner_customer_id")
    .eq("id", keyRow.organization_id)
    .maybeSingle<{ owner_customer_id: string }>();
  if (orgError) throw new Error(`verifyApiKey org lookup failed: ${orgError.message}`);
  if (!org) return null;

  // Update last_used_at. Awaited to ensure Vercel serverless doesn't freeze
  // the function before the write completes. Single indexed write, low latency.
  await supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRow.id);

  return {
    keyId: keyRow.id,
    orgId: keyRow.organization_id,
    ownerCustomerId: org.owner_customer_id,
  };
}
