import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { signMagicLinkToken, verifyMagicLinkToken } from "./magic-link";

describe("magic-link tokens", () => {
  const prev = process.env.CUSTOMER_SESSION_SECRET;

  beforeEach(() => {
    process.env.CUSTOMER_SESSION_SECRET = "x".repeat(32);
    delete process.env.LABELWATCH_MAGIC_LINK_SECRET;
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.CUSTOMER_SESSION_SECRET;
    else process.env.CUSTOMER_SESSION_SECRET = prev;
  });

  it("round-trips a customer id", () => {
    const t = signMagicLinkToken("cust-123");
    expect(verifyMagicLinkToken(t)).toEqual({ customerId: "cust-123" });
  });

  it("rejects tampered tokens", () => {
    const t = signMagicLinkToken("cust-123");
    const bad = t.slice(0, -4) + "aaaa";
    expect(verifyMagicLinkToken(bad)).toBeNull();
  });

  it("rejects expired tokens", () => {
    const t = signMagicLinkToken("cust-123", -10);
    expect(verifyMagicLinkToken(t)).toBeNull();
  });

  it("rejects null/empty", () => {
    expect(verifyMagicLinkToken(null)).toBeNull();
    expect(verifyMagicLinkToken("")).toBeNull();
  });
});
