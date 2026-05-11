import { describe, expect, it } from "vitest";
import {
  HTTP_WEBHOOK_HELP_ITEMS,
  HTTP_WEBHOOK_HELP_SUMMARY,
  TEAMS_WEBHOOK_HELP,
} from "./channel-help";

describe("channel setup help", () => {
  it("explains the HTTP webhook receiver contract", () => {
    const help = [HTTP_WEBHOOK_HELP_SUMMARY, ...HTTP_WEBHOOK_HELP_ITEMS].join(" ");

    expect(help).toContain("HTTPS");
    expect(help).toContain("POST");
    expect(help).toContain("2xx");
    expect(help).toContain("Authorization");
    expect(help).toContain("one time");
    expect(help).toContain("X-LabelWatch-Signature");
    expect(help).toContain("raw request body");
    expect(help).toContain("HMAC-SHA256");
  });

  it("keeps Teams setup focused on incoming webhook URLs", () => {
    expect(TEAMS_WEBHOOK_HELP).toContain("Incoming Webhook");
    expect(TEAMS_WEBHOOK_HELP).toContain("https://");
  });
});
