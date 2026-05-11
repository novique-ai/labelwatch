import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const { insertMock, sendEmailMock } = vi.hoisted(() => ({
  insertMock: vi.fn(),
  sendEmailMock: vi.fn(),
}));

vi.mock("./supabase", () => ({
  getSupabase: () => ({
    from: vi.fn((table: string) => {
      expect(table).toBe("subscription_events");
      return { insert: insertMock };
    }),
  }),
}));

vi.mock("./resend", () => ({
  URGENT_HEADERS: { "X-Priority": "1" },
  sendEmail: sendEmailMock,
}));

import { persistSubscriptionEvent } from "./subscriptions";

function subscriptionEvent(
  overrides: Partial<Stripe.Subscription> = {},
): Stripe.Event {
  return {
    id: "evt_subscription_created",
    type: "customer.subscription.created",
    data: {
      object: {
        id: "sub_123",
        customer: "cus_123",
        status: "trialing",
        metadata: { tier: "team" },
        ...overrides,
      },
    },
  } as Stripe.Event;
}

function paymentFailedEvent(): Stripe.Event {
  return {
    id: "evt_payment_failed",
    type: "invoice.payment_failed",
    data: {
      object: {
        id: "in_123",
        customer: "cus_123",
        lines: { data: [{ subscription: "sub_123" }] },
      },
    },
  } as unknown as Stripe.Event;
}

beforeEach(() => {
  insertMock.mockReset();
  sendEmailMock.mockReset();
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  process.env.SUBSCRIPTION_ALERT_TO = "ops@example.com";
  process.env.CONTACT_EMAIL_FROM = "LabelWatch <noreply@label.watch>";
});

describe("persistSubscriptionEvent", () => {
  it("alerts the operator after a new subscription event is persisted", async () => {
    insertMock.mockResolvedValue({ error: null });
    sendEmailMock.mockResolvedValue({ ok: true });

    await persistSubscriptionEvent(subscriptionEvent());

    expect(sendEmailMock).toHaveBeenCalledOnce();
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "LabelWatch <noreply@label.watch>",
        to: "ops@example.com",
        subject: expect.stringContaining("customer.subscription.created"),
        text: expect.stringContaining("team"),
        headers: { "X-Priority": "1" },
      }),
    );
  });

  it("alerts the operator for failed payments", async () => {
    insertMock.mockResolvedValue({ error: null });
    sendEmailMock.mockResolvedValue({ ok: true });

    await persistSubscriptionEvent(paymentFailedEvent());

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining("invoice.payment_failed"),
        text: expect.stringContaining("payment_failed"),
      }),
    );
  });

  it("does not alert again for duplicate Stripe event retries", async () => {
    insertMock.mockResolvedValue({ error: { code: "23505", message: "duplicate" } });

    await persistSubscriptionEvent(subscriptionEvent());

    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
