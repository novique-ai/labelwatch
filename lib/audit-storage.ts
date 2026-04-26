// Supabase Storage helper for SFP image uploads.
// Bucket: LABELWATCH_AUDIT_BUCKET (default `audit-sfp-images`). Service-role-only.

import type { SupabaseClient } from "@supabase/supabase-js";

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg"]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export const SFP_MIME_ACCEPT = "image/png,image/jpeg";

export function bucketName(): string {
  return process.env.LABELWATCH_AUDIT_BUCKET || "audit-sfp-images";
}

export function isAllowedSfpMime(mime: string): boolean {
  return ALLOWED_MIME.has(mime.toLowerCase());
}

export function isAllowedSfpSize(byteLength: number): boolean {
  return byteLength > 0 && byteLength <= MAX_BYTES;
}

export function extFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  return "jpg";
}

export async function ensureBucket(supabase: SupabaseClient): Promise<void> {
  const name = bucketName();
  const { data: existing } = await supabase.storage.getBucket(name);
  if (existing) return;
  const { error } = await supabase.storage.createBucket(name, { public: false });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`createBucket(${name}) failed: ${error.message}`);
  }
}

export async function uploadSfpImage(
  supabase: SupabaseClient,
  customerId: string,
  runId: string,
  bytes: Uint8Array,
  mime: string,
): Promise<string> {
  const path = `${customerId}/${runId}.${extFromMime(mime)}`;
  await ensureBucket(supabase);
  const { error } = await supabase.storage
    .from(bucketName())
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (error) {
    throw new Error(`sfp upload failed: ${error.message}`);
  }
  return path;
}

export async function downloadSfpImage(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const { data, error } = await supabase.storage
    .from(bucketName())
    .download(storagePath);
  if (error || !data) {
    throw new Error(`sfp download failed: ${error?.message ?? "no data"}`);
  }
  const buf = new Uint8Array(await data.arrayBuffer());
  const mime = data.type || (storagePath.endsWith(".png") ? "image/png" : "image/jpeg");
  return { bytes: buf, mime };
}
