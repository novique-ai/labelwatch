import Stripe from "stripe";

export type Tier = "starter" | "pro" | "team";

const PRICE_ENV_KEYS: Record<Tier, string> = {
  starter: "STRIPE_PRICE_STARTER",
  pro: "STRIPE_PRICE_PRO",
  team: "STRIPE_PRICE_TEAM",
};

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  return new Stripe(key, {
    typescript: true,
  });
}

export function priceIdForTier(tier: Tier): string {
  const envKey = PRICE_ENV_KEYS[tier];
  const value = process.env[envKey];
  if (!value) {
    throw new Error(`${envKey} is not set`);
  }
  return value;
}

export function isValidTier(value: unknown): value is Tier {
  return value === "starter" || value === "pro" || value === "team";
}
