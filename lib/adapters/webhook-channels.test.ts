import { afterEach, describe, expect, it, vi } from "vitest";
import { httpAdapter, signPayload } from "./http";
import { teamsAdapter } from "./teams";
import type {
  CustomerChannelRow,
  DeliveryJobRow,
  RecallRow,
} from "@/types/database.types";

function job(overrides: Partial<DeliveryJobRow> = {}): DeliveryJobRow {
  return {
    id: "job-1",
    recall_id: "rec-1",
    customer_id: "cust-1",
    customer_channel_id: "ch-1",
    match_reason: "firm_alias",
    matched_value: "Acme Foods",
    status: "delivering",
    attempts: 1,
    last_attempt_at: null,
    next_attempt_at: "2026-01-01T00:00:00Z",
    last_error: null,
    severity_class: "Class II",
    sent_at: null,
    created_at: "2026-01-01T00:00:00Z",
    created_by_matcher_run_id: null,
    digest_window_date: null,
    ...overrides,
  };
}

function recall(overrides: Partial<RecallRow> = {}): RecallRow {
  return {
    id: "rec-1",
    recall_number: "F-1234-2026",
    firm_id: null,
    firm_name_raw: "Acme Foods LLC",
    product_description: "Pre-workout powder",
    reason_for_recall: "Undeclared milk allergen",
    classification: "Class II",
    status: "Ongoing",
    recall_initiation_date: "2026-02-13",
    report_date: "2026-02-13",
    source: "openfda-food-enforcement",
    vertical: "dietary_supplement",
    openfda_raw: {},
    first_seen_at: "2026-02-14T00:00:00Z",
    last_updated_at: "2026-02-14T00:00:00Z",
    ...overrides,
  };
}

function channel(overrides: Partial<CustomerChannelRow> = {}): CustomerChannelRow {
  return {
    id: "ch-1",
    customer_id: "cust-1",
    type: "http",
    config: {},
    enabled: true,
    severity_filter: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("HTTP webhook adapter", () => {
  it("POSTs signed JSON with optional Authorization", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const secret = "a".repeat(64);

    const outcome = await httpAdapter(
      job(),
      recall(),
      channel({
        type: "http",
        config: {
          url: "https://example.test/labelwatch",
          auth_header: "Bearer test-token",
          signing_secret: secret,
        },
      }),
    );

    expect(outcome).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.test/labelwatch");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
      "X-LabelWatch-Delivery-Id": "job-1",
    });
    expect((init.headers as Record<string, string>)["X-LabelWatch-Signature"]).toBe(
      signPayload(secret, init.body as string),
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      delivery_id: "job-1",
      recall: { recall_number: "F-1234-2026" },
      match: { reason: "firm_alias", value: "Acme Foods" },
      severity_class: "Class II",
    });
  });
});

describe("Teams webhook adapter", () => {
  it("POSTs a Teams MessageCard payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await teamsAdapter(
      job(),
      recall(),
      channel({
        type: "teams",
        config: { webhook_url: "https://example.test/teams" },
      }),
    );

    expect(outcome).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.test/teams");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toMatchObject({
      "@type": "MessageCard",
      "@context": "https://schema.org/extensions",
      summary: "🚨 ACME FOODS RECALLED",
      title: "🚨 ACME FOODS RECALLED",
      sections: [
        {
          facts: expect.arrayContaining([
            { name: "Classification", value: "Class II" },
            { name: "Recall #", value: "F-1234-2026" },
          ]),
        },
      ],
    });
  });
});

describe.skipIf(process.env.LIVE_CHANNEL_WEBHOOKS !== "1")(
  "live webhook receivers",
  () => {
    it("delivers Teams and HTTP payloads to public HTTPS test webhooks", async () => {
      const teamsUrl = process.env.LIVE_TEAMS_WEBHOOK_URL;
      const httpUrl = process.env.LIVE_HTTP_WEBHOOK_URL;
      if (!teamsUrl || !httpUrl) {
        throw new Error("LIVE_TEAMS_WEBHOOK_URL and LIVE_HTTP_WEBHOOK_URL are required");
      }

      const secret = "b".repeat(64);
      const [teamsOutcome, httpOutcome] = await Promise.all([
        teamsAdapter(
          job({ id: "live-teams-job" }),
          recall({ recall_number: "LIVE-TEAMS-2026" }),
          channel({
            id: "live-teams-channel",
            type: "teams",
            config: { webhook_url: teamsUrl },
          }),
        ),
        httpAdapter(
          job({ id: "live-http-job" }),
          recall({ recall_number: "LIVE-HTTP-2026" }),
          channel({
            id: "live-http-channel",
            type: "http",
            config: {
              url: httpUrl,
              auth_header: "Bearer labelwatch-live-test",
              signing_secret: secret,
            },
          }),
        ),
      ]);

      expect(teamsOutcome).toEqual({ ok: true });
      expect(httpOutcome).toEqual({ ok: true });
    }, 20_000);
  },
);
