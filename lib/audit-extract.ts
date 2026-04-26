// Claude-powered structured extraction for the lcaudit pipeline.
// extractSfpFromImage: vision extract → SfpExtract.
// extractListing:      text extract  → ListingExtract.
//
// Model: claude-sonnet-4-6 (vision-capable, accuracy matters for SFP OCR).
// Output is forced via tool_use so we get JSON validated against input_schema.

import Anthropic from "@anthropic-ai/sdk";
import type {
  ListingExtract,
  SfpExtract,
} from "@/types/database.types";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("missing ANTHROPIC_API_KEY in environment");
  return new Anthropic({ apiKey });
}

const SFP_TOOL: Anthropic.Tool = {
  name: "record_sfp",
  description:
    "Record the structured contents of a Supplement Facts Panel extracted from the provided image.",
  input_schema: {
    type: "object",
    required: ["ingredients", "claims", "serving_size", "warnings"],
    properties: {
      ingredients: {
        type: "array",
        description: "Each row of the SFP ingredients table.",
        items: {
          type: "object",
          required: ["name", "amount", "daily_value_pct"],
          properties: {
            name: { type: "string" },
            amount: { type: ["string", "null"] },
            daily_value_pct: { type: ["string", "null"] },
          },
        },
      },
      claims: {
        type: "array",
        description: "Marketing-style claims printed on the panel itself (rare).",
        items: { type: "string" },
      },
      serving_size: { type: ["string", "null"] },
      warnings: {
        type: "array",
        description: "Warning / caution / contraindication text on the panel.",
        items: { type: "string" },
      },
    },
  },
};

const LISTING_TOOL: Anthropic.Tool = {
  name: "record_listing",
  description:
    "Record the structured ingredient mentions, marketing claims, and surfaced warnings extracted from a product listing.",
  input_schema: {
    type: "object",
    required: ["ingredients", "claims", "warnings_surfaced"],
    properties: {
      ingredients: {
        type: "array",
        description: "Each ingredient mentioned in the listing copy with its line number.",
        items: {
          type: "object",
          required: ["name", "amount", "line"],
          properties: {
            name: { type: "string" },
            amount: { type: ["string", "null"] },
            line: { type: "integer", description: "1-indexed line in the listing copy." },
          },
        },
      },
      claims: {
        type: "array",
        description:
          "Marketing claims about the product's effects, benefits, or quality, with the line they appear on.",
        items: {
          type: "object",
          required: ["text", "line"],
          properties: {
            text: { type: "string" },
            line: { type: "integer" },
          },
        },
      },
      warnings_surfaced: {
        type: "array",
        description: "Warning / caution / contraindication text that appears in the listing copy.",
        items: { type: "string" },
      },
    },
  },
};

function pickToolInput<T>(resp: Anthropic.Message, toolName: string): T {
  const block = resp.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === toolName,
  );
  if (!block) throw new Error(`model did not return ${toolName} tool_use block`);
  return block.input as T;
}

export async function extractSfpFromImage(
  bytes: Uint8Array,
  mime: string,
): Promise<SfpExtract> {
  const client = getClient();
  const data = Buffer.from(bytes).toString("base64");
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    tools: [SFP_TOOL],
    tool_choice: { type: "tool", name: SFP_TOOL.name },
    system:
      "You are an expert at reading dietary-supplement labels. Extract the Supplement Facts Panel content verbatim. Preserve units and percentages exactly as printed. If a field is not present, return null (or empty array).",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mime as "image/png" | "image/jpeg",
              data,
            },
          },
          {
            type: "text",
            text: "Extract the SFP from this image and call record_sfp with the result.",
          },
        ],
      },
    ],
  });
  return pickToolInput<SfpExtract>(resp, SFP_TOOL.name);
}

export async function extractListing(text: string): Promise<ListingExtract> {
  const client = getClient();
  const lines = text.split(/\r?\n/);
  const numbered = lines.map((l, i) => `${i + 1}: ${l}`).join("\n");
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    tools: [LISTING_TOOL],
    tool_choice: { type: "tool", name: LISTING_TOOL.name },
    system:
      "You analyze Amazon / brand-site product-listing copy for dietary supplements. Identify ingredient mentions, marketing claims about effects or benefits, and any safety warnings surfaced in the copy. Use the line number from the prefixed input verbatim.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Listing copy follows, prefixed with `<line_number>: `. Extract structured data and call record_listing.\n\n" +
              numbered,
          },
        ],
      },
    ],
  });
  return pickToolInput<ListingExtract>(resp, LISTING_TOOL.name);
}
