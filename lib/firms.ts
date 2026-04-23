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

// Append customer-supplied DBA/alias strings to an existing firm row. Used by
// the /onboard flow so the matcher can hit aliases seeded by customers even
// before openFDA ever emits the variant. Idempotent: only appends strings not
// already present. Aliases are normalized (lowercased + whitespace-collapsed)
// so the `.cs.{<canonical>}` lookup in findOrCreateFirm matches them — the
// GIN array index is case-sensitive.
//
// KNOWN LIMITATION (MVP2): read-modify-write race. Two concurrent onboardings
// resolving to the same firm can silently drop one side's aliases. Low risk at
// pilot scale; fix path is an atomic RPC using `array(select distinct unnest)`.
export async function appendFirmAliases(
  supabase: SupabaseClient,
  firmId: string,
  newAliases: string[],
): Promise<void> {
  if (newAliases.length === 0) return;

  const cleaned = Array.from(
    new Set(
      newAliases
        .map((a) => normalizeFirmName(a))
        .filter((a) => a.length > 0 && a.length <= 200),
    ),
  );
  if (cleaned.length === 0) return;

  const { data: current, error: readError } = await supabase
    .from("firms")
    .select("aliases")
    .eq("id", firmId)
    .single();

  if (readError) {
    throw new Error(`firm alias read failed: ${readError.message}`);
  }

  const existing = new Set<string>(
    Array.isArray(current?.aliases) ? (current.aliases as string[]) : [],
  );
  const merged = [...existing];
  for (const a of cleaned) {
    if (!existing.has(a)) merged.push(a);
  }
  if (merged.length === existing.size) return; // nothing new

  const { error: writeError } = await supabase
    .from("firms")
    .update({
      aliases: merged,
      updated_at: new Date().toISOString(),
    })
    .eq("id", firmId);

  if (writeError) {
    throw new Error(`firm alias write failed: ${writeError.message}`);
  }
}
