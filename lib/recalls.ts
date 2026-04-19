// openFDA dietary-supplement recall fetcher (server-side, cached).
// Used by the live wire feed on the landing page.

export type Recall = {
  firm: string;
  product: string;
  classification: "Class I" | "Class II" | "Class III" | string;
  date: string; // YYYY-MM-DD
  reason: string;
  recallNumber: string;
};

const OPENFDA_URL = "https://api.fda.gov/food/enforcement.json";

function formatDate(yyyymmdd: string): string {
  if (!yyyymmdd || yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function shorten(text: string | undefined, max: number): string {
  if (!text) return "";
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

export async function fetchRecentSupplementRecalls(limit = 8): Promise<Recall[]> {
  const search = `product_description:%22dietary+supplement%22`;
  const url = `${OPENFDA_URL}?search=${search}&limit=${limit}&sort=recall_initiation_date:desc`;

  try {
    const resp = await fetch(url, {
      next: { revalidate: 3600 }, // refresh hourly at most
      headers: { "User-Agent": "labelwatch.web/0.1" },
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const results = (data.results ?? []) as Array<Record<string, string>>;
    return results.map((r) => ({
      firm: shorten(r.recalling_firm, 64),
      product: shorten(r.product_description, 110),
      classification: r.classification ?? "—",
      date: formatDate(r.recall_initiation_date ?? ""),
      reason: shorten(r.reason_for_recall, 160),
      recallNumber: r.recall_number ?? "",
    }));
  } catch {
    return [];
  }
}
