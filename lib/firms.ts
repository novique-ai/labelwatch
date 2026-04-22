// Canonical-firm lookup. Matches openFDA `recalling_firm` strings against
// stored firms (canonical_name + aliases). Creates new firm rows on first
// sight. Used by the poller and the backfill script.

import type { SupabaseClient } from "@supabase/supabase-js";

export function normalizeFirmName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s,.]+$/g, "");
}

export type FirmResolution = {
  firmId: string;
  wasCreated: boolean;
};

export async function findOrCreateFirm(
  supabase: SupabaseClient,
  rawFirmName: string,
): Promise<FirmResolution> {
  const canonical = normalizeFirmName(rawFirmName);
  if (!canonical) {
    throw new Error("firm name cannot be empty");
  }

  const { data: existing, error: selectError } = await supabase
    .from("firms")
    .select("id")
    .or(`canonical_name.eq.${escapeForOr(canonical)},aliases.cs.{${escapeForOr(canonical)}}`)
    .limit(1)
    .maybeSingle();

  if (selectError) {
    throw new Error(`firm lookup failed: ${selectError.message}`);
  }
  if (existing?.id) {
    return { firmId: existing.id, wasCreated: false };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("firms")
    .insert({
      canonical_name: canonical,
      display_name: rawFirmName.trim(),
    })
    .select("id")
    .single();

  if (insertError) {
    // Race: another poll created the same firm between our SELECT and INSERT.
    // Unique-violation on firms_canonical_name_key — re-read and return.
    if (insertError.code === "23505") {
      const { data: raced } = await supabase
        .from("firms")
        .select("id")
        .eq("canonical_name", canonical)
        .single();
      if (raced?.id) return { firmId: raced.id, wasCreated: false };
    }
    throw new Error(`firm insert failed: ${insertError.message}`);
  }

  return { firmId: inserted.id, wasCreated: true };
}

// PostgREST .or() uses comma as a separator and parentheses/commas in values
// break the parser. Quote the value; normalized firm names have no quotes
// themselves (we lowercase + strip punctuation).
function escapeForOr(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}
