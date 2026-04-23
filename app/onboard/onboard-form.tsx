"use client";

// Three-step onboarding form. Local React state only (no server-side
// step persistence). Single POST to /api/onboard at the end. Follows the
// controlled-useState pattern established by app/signup-form.tsx.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  INGREDIENT_CATEGORIES,
  type ChannelConfig,
  type ChannelType,
  type IngredientCategory,
  type SeverityClass,
  type Tier,
} from "@/types/database.types";

type Props = {
  sessionId: string;
  initialEmail: string;
  initialFirmName: string;
  tier: Tier;
};

const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  protein: "Protein",
  vitamins: "Vitamins",
  minerals: "Minerals",
  herbals_botanicals: "Herbals & botanicals",
  probiotics: "Probiotics",
  sports_nutrition: "Sports nutrition",
  weight_management: "Weight management",
  amino_acids: "Amino acids",
  omega_fatty_acids: "Omega fatty acids",
  pre_workout: "Pre-workout",
  childrens: "Children's",
  other: "Other",
};

const TIER_LABEL: Record<Tier, string> = {
  starter: "Starter — $39/mo",
  pro: "Pro — $99/mo",
  team: "Team — $299/mo",
};

type Step = 1 | 2 | 3;

type ChannelFormState = {
  type: ChannelType;
  slackWebhook: string;
  teamsWebhook: string;
  httpUrl: string;
  httpAuthHeader: string;
  emailAddress: string;
};

export default function OnboardForm({
  sessionId,
  initialEmail,
  initialFirmName,
  tier,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const firmName = initialFirmName;
  const [aliasInput, setAliasInput] = useState("");
  const [aliases, setAliases] = useState<string[]>([]);

  // Step 2
  const [categories, setCategories] = useState<Set<IngredientCategory>>(new Set());
  const [minClass, setMinClass] = useState<SeverityClass>("II");

  // Step 3
  const [channel, setChannel] = useState<ChannelFormState>({
    type: "email",
    slackWebhook: "",
    teamsWebhook: "",
    httpUrl: "",
    httpAuthHeader: "",
    emailAddress: initialEmail,
  });

  function addAlias() {
    const a = aliasInput.trim();
    if (!a) return;
    if (aliases.includes(a)) {
      setAliasInput("");
      return;
    }
    setAliases([...aliases, a]);
    setAliasInput("");
  }

  function removeAlias(a: string) {
    setAliases(aliases.filter((x) => x !== a));
  }

  function toggleCategory(c: IngredientCategory) {
    const next = new Set(categories);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    setCategories(next);
  }

  function buildChannelConfig(): { type: ChannelType; config: ChannelConfig } | null {
    if (channel.type === "slack") {
      if (!channel.slackWebhook.startsWith("https://")) return null;
      return { type: "slack", config: { webhook_url: channel.slackWebhook } };
    }
    if (channel.type === "teams") {
      if (!channel.teamsWebhook.startsWith("https://")) return null;
      return { type: "teams", config: { webhook_url: channel.teamsWebhook } };
    }
    if (channel.type === "http") {
      if (!channel.httpUrl.startsWith("https://")) return null;
      return {
        type: "http",
        config: {
          url: channel.httpUrl,
          auth_header: channel.httpAuthHeader.trim() || null,
        },
      };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(channel.emailAddress)) return null;
    return { type: "email", config: { address: channel.emailAddress } };
  }

  async function handleSubmit() {
    setError(null);
    const built = buildChannelConfig();
    if (!built) {
      setError("Please enter a valid delivery endpoint.");
      return;
    }
    if (categories.size === 0) {
      setError("Pick at least one ingredient category so we know what to watch.");
      setStep(2);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          firm_aliases: aliases,
          ingredient_categories: Array.from(categories),
          severity_preferences: { default_min_class: minClass },
          channel: built,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong. Try again in a moment.");
        return;
      }
      router.push("/onboard/complete");
    } catch (err) {
      console.error(err);
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-rule bg-paper p-6 md:p-10 shadow-sm">
      <StepIndicator step={step} />

      <div className="mb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted">
          {TIER_LABEL[tier]}
        </p>
      </div>

      {step === 1 && (
        <section>
          <h2 className="font-display text-2xl mb-2">1. Your firm</h2>
          <p className="text-ink-muted mb-6 text-sm">
            This is how we match FDA recalls to you. Your billing name is below —
            add any DBAs, subsidiaries, or name variants openFDA might use.
          </p>

          <label className="block mb-6">
            <span className="block font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted mb-2">
              Billing name
            </span>
            <div className="w-full rounded border border-rule bg-paper px-3 py-2 text-ink">
              {firmName || <span className="text-ink-muted italic">(not captured — add at least one alias below)</span>}
            </div>
          </label>

          <label className="block mb-3">
            <span className="block font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted mb-2">
              Aliases, DBAs, subsidiaries
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addAlias();
                  }
                }}
                placeholder="e.g. Acme Supplements, Inc."
                className="flex-1 rounded border border-rule bg-paper px-3 py-2 text-ink focus:outline-none focus:border-ink"
              />
              <button
                type="button"
                onClick={addAlias}
                className="rounded border border-ink px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] hover:bg-ink hover:text-paper"
              >
                Add
              </button>
            </div>
          </label>

          {aliases.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {aliases.map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center gap-2 rounded-full bg-ink/5 px-3 py-1 text-sm"
                >
                  {a}
                  <button
                    type="button"
                    onClick={() => removeAlias(a)}
                    aria-label={`Remove ${a}`}
                    className="text-ink-muted hover:text-recall"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded bg-ink px-6 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-paper hover:bg-ink/80"
            >
              Next: scope
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section>
          <h2 className="font-display text-2xl mb-2">2. What to watch for</h2>
          <p className="text-ink-muted mb-6 text-sm">
            Pick every category that applies. Recalls outside these won&apos;t
            reach you.
          </p>

          <fieldset className="mb-8">
            <legend className="block font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted mb-3">
              Ingredient categories
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {INGREDIENT_CATEGORIES.map((c) => (
                <label
                  key={c}
                  className="flex items-center gap-3 rounded border border-rule px-3 py-2 hover:border-ink cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={categories.has(c)}
                    onChange={() => toggleCategory(c)}
                    className="h-4 w-4"
                  />
                  <span>{CATEGORY_LABELS[c]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="mb-8">
            <legend className="block font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted mb-3">
              Minimum severity class
            </legend>
            <div className="space-y-2">
              {(["I", "II", "III"] as SeverityClass[]).map((cls) => (
                <label
                  key={cls}
                  className="flex items-start gap-3 rounded border border-rule px-3 py-2 hover:border-ink cursor-pointer"
                >
                  <input
                    type="radio"
                    name="severity"
                    checked={minClass === cls}
                    onChange={() => setMinClass(cls)}
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    <strong>Class {cls}</strong> and more severe{" "}
                    <span className="text-ink-muted text-sm">
                      {cls === "I" && "— life-threatening only"}
                      {cls === "II" && "— reversible harm and worse (recommended)"}
                      {cls === "III" && "— every recall, including labeling defects"}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded border border-ink px-6 py-2 font-mono text-[10px] uppercase tracking-[0.2em] hover:bg-ink hover:text-paper"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="rounded bg-ink px-6 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-paper hover:bg-ink/80"
            >
              Next: delivery
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section>
          <h2 className="font-display text-2xl mb-2">3. Where to deliver</h2>
          <p className="text-ink-muted mb-6 text-sm">
            One channel to start. You can add more after onboarding.
          </p>

          <fieldset className="mb-6">
            <legend className="block font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted mb-3">
              Channel type
            </legend>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(["email", "slack", "teams", "http"] as ChannelType[]).map((t) => (
                <label
                  key={t}
                  className="flex items-center justify-center gap-2 rounded border border-rule px-3 py-2 hover:border-ink cursor-pointer"
                >
                  <input
                    type="radio"
                    name="channel-type"
                    checked={channel.type === t}
                    onChange={() => setChannel({ ...channel, type: t })}
                    className="h-4 w-4"
                  />
                  <span className="capitalize">{t}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {channel.type === "email" && (
            <label className="block mb-6">
              <span className="block font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted mb-2">
                Delivery email
              </span>
              <input
                type="email"
                value={channel.emailAddress}
                onChange={(e) =>
                  setChannel({ ...channel, emailAddress: e.target.value })
                }
                placeholder="alerts@yourfirm.com"
                className="w-full rounded border border-rule bg-paper px-3 py-2 text-ink focus:outline-none focus:border-ink"
              />
            </label>
          )}

          {channel.type === "slack" && (
            <label className="block mb-6">
              <span className="block font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted mb-2">
                Slack webhook URL
              </span>
              <input
                type="url"
                value={channel.slackWebhook}
                onChange={(e) =>
                  setChannel({ ...channel, slackWebhook: e.target.value })
                }
                placeholder="https://hooks.slack.com/services/..."
                className="w-full rounded border border-rule bg-paper px-3 py-2 text-ink focus:outline-none focus:border-ink"
              />
            </label>
          )}

          {channel.type === "teams" && (
            <label className="block mb-6">
              <span className="block font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted mb-2">
                Microsoft Teams incoming-webhook URL
              </span>
              <input
                type="url"
                value={channel.teamsWebhook}
                onChange={(e) =>
                  setChannel({ ...channel, teamsWebhook: e.target.value })
                }
                placeholder="https://outlook.office.com/webhook/..."
                className="w-full rounded border border-rule bg-paper px-3 py-2 text-ink focus:outline-none focus:border-ink"
              />
            </label>
          )}

          {channel.type === "http" && (
            <>
              <label className="block mb-4">
                <span className="block font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted mb-2">
                  POST endpoint URL
                </span>
                <input
                  type="url"
                  value={channel.httpUrl}
                  onChange={(e) =>
                    setChannel({ ...channel, httpUrl: e.target.value })
                  }
                  placeholder="https://your-service.example.com/labelwatch"
                  className="w-full rounded border border-rule bg-paper px-3 py-2 text-ink focus:outline-none focus:border-ink"
                />
              </label>
              <label className="block mb-6">
                <span className="block font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted mb-2">
                  Authorization header (optional)
                </span>
                <input
                  type="text"
                  value={channel.httpAuthHeader}
                  onChange={(e) =>
                    setChannel({ ...channel, httpAuthHeader: e.target.value })
                  }
                  placeholder="Bearer your-secret-token"
                  className="w-full rounded border border-rule bg-paper px-3 py-2 text-ink focus:outline-none focus:border-ink"
                />
              </label>
            </>
          )}

          {error && (
            <div
              role="alert"
              className="mb-4 rounded border border-recall bg-recall/10 px-4 py-2 text-sm text-recall"
            >
              {error}
            </div>
          )}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={submitting}
              className="rounded border border-ink px-6 py-2 font-mono text-[10px] uppercase tracking-[0.2em] hover:bg-ink hover:text-paper disabled:opacity-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded bg-ink px-6 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-paper hover:bg-ink/80 disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Finish onboarding"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  return (
    <ol className="mb-8 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em]">
      {[1, 2, 3].map((n) => (
        <li
          key={n}
          className={`flex items-center gap-2 ${
            step === n ? "text-ink" : step > n ? "text-ink-muted" : "text-ink-muted/50"
          }`}
        >
          <span
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${
              step >= n ? "border-ink" : "border-rule"
            }`}
          >
            {step > n ? "✓" : n}
          </span>
          <span>
            {n === 1 ? "Firm" : n === 2 ? "Scope" : "Delivery"}
          </span>
          {n < 3 && <span className="ml-2 text-ink-muted/50">—</span>}
        </li>
      ))}
    </ol>
  );
}
