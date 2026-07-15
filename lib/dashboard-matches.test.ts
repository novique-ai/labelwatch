import { describe, expect, it } from "vitest";
import {
  dedupeMatchesByRecall,
  isInactiveSubscriptionStatus,
  isSyntheticMatch,
  redactWebhookDestination,
  type DashboardMatchInput,
} from "./dashboard-matches";

function row(
  partial: Partial<DashboardMatchInput> & { id: string },
): DashboardMatchInput {
  return {
    status: "sent",
    severity_class: "Class II",
    matched_value: "vitamins",
    sent_at: null,
    created_at: "2026-07-15T12:00:00.000Z",
    recall_id: "rec-1",
    recall: {
      recall_number: "H-1",
      firm_name_raw: "Acme Labs",
      product_description: "Widget",
    },
    ...partial,
  };
}

describe("dedupeMatchesByRecall", () => {
  it("collapses two channels for the same recall into one row", () => {
    const out = dedupeMatchesByRecall([
      row({ id: "a", recall_id: "r1" }),
      row({ id: "b", recall_id: "r1" }),
      row({
        id: "c",
        recall_id: "r2",
        recall: {
          recall_number: "H-2",
          firm_name_raw: "Other Co",
          product_description: "Thing",
        },
      }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].channel_count).toBe(2);
    expect(out[0].display_status).toBe("sent");
    expect(out[1].channel_count).toBe(1);
  });

  it("filters synthetic test manufacturer rows", () => {
    const out = dedupeMatchesByRecall([
      row({
        id: "syn",
        recall_id: "syn1",
        recall: {
          recall_number: "SYN-MARK-1",
          firm_name_raw: "Synthetic Test Manufacturer Inc.",
          product_description: "Whey",
        },
      }),
      row({ id: "real", recall_id: "r1" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("real");
  });

  it("prefers sent when mixed channel statuses", () => {
    const out = dedupeMatchesByRecall([
      row({ id: "a", status: "dead_letter", recall_id: "r1" }),
      row({ id: "b", status: "sent", recall_id: "r1" }),
    ]);
    expect(out[0].display_status).toBe("sent");
  });

  it("respects limit after dedupe", () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      row({
        id: `id-${i}`,
        recall_id: `r-${i}`,
        recall: {
          recall_number: `H-${i}`,
          firm_name_raw: "Co",
          product_description: "P",
        },
      }),
    );
    expect(dedupeMatchesByRecall(rows, 3)).toHaveLength(3);
  });
});

describe("isSyntheticMatch", () => {
  it("detects SYN- recall numbers", () => {
    expect(
      isSyntheticMatch(
        row({
          id: "x",
          recall: {
            recall_number: "SYN-1",
            firm_name_raw: "Someone",
            product_description: null,
          },
        }),
      ),
    ).toBe(true);
  });
});

describe("redactWebhookDestination", () => {
  it("hides the secret path segment", () => {
    const raw =
      "https://hooks.slack.com/services/T0B0RE67FQF/B0B2EXXXXX/secretTokenHere";
    const out = redactWebhookDestination(raw);
    expect(out).toContain("T0B0RE67FQF");
    expect(out).toContain("••••••••");
    expect(out).not.toContain("secretTokenHere");
  });
});

describe("isInactiveSubscriptionStatus", () => {
  it("flags canceled variants", () => {
    expect(isInactiveSubscriptionStatus("canceled")).toBe(true);
    expect(isInactiveSubscriptionStatus("active")).toBe(false);
    expect(isInactiveSubscriptionStatus("trialing")).toBe(false);
  });
});
