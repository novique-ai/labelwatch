// One-off backfill: seed firms + recalls with ~18 months of openFDA
// dietary-supplement history so launch-day customers see real data.
//
// Run:
//   cd ~/IDE/projects/labelwatch
//   npx tsx scripts/backfill.ts
//
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env (loaded via
// .env.local or shell). Idempotent — safe to re-run.

import { runPoll } from "../lib/poller";

async function main() {
  const windowDays = Number(process.env.BACKFILL_WINDOW_DAYS ?? 540);
  const maxPages = Number(process.env.BACKFILL_MAX_PAGES ?? 50);

  console.log(
    `backfill: fetching openFDA dietary-supplement recalls for the last ${windowDays} days (max ${maxPages} pages of ${100})`,
  );

  const result = await runPoll({ windowDays, maxPages });

  console.log("backfill complete:");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("backfill failed:", err);
  process.exit(1);
});
