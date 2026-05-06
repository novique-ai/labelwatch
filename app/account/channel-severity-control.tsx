"use client";

// Inline per-channel severity routing control. Bead infrastructure-dxkk.
//
// Renders inside each row of the Delivery channels list on /account.
// - Pro+ tier: dropdown with "Inherit (Class II)" + Class I / II / III.
//   Saves to PATCH /api/account/channels?id=<id> on change.
// - Starter tier: read-only label + upsell line.

import { useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";

type Tier = "starter" | "pro" | "team";
type SeverityClass = "I" | "II" | "III";

type Props = {
  channelId: string;
  tier: string;
  defaultMinClass: SeverityClass; // customer-level default — used when filter=null
  initialFilter: { min_class: SeverityClass } | null;
};

const styles: Record<string, CSSProperties> = {
  wrap: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: "1px dashed var(--color-border-subtle)",
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  label: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "var(--color-text-muted)",
  },
  select: {
    background: "var(--color-bg-input)",
    border: "1px solid var(--color-border-subtle)",
    color: "var(--color-text-primary)",
    padding: "6px 10px",
    borderRadius: 3,
    fontSize: 12,
    fontFamily: "inherit",
    cursor: "pointer",
  },
  ro: {
    fontSize: 12,
    color: "var(--color-text-secondary)",
  },
  upsell: {
    fontSize: 11,
    color: "var(--color-text-muted)",
    fontStyle: "italic",
  },
  status: {
    fontSize: 11,
    color: "var(--color-text-muted)",
  },
  err: {
    fontSize: 11,
    color: "var(--color-signal-red)",
  },
};

function isTier(value: string): value is Tier {
  return value === "starter" || value === "pro" || value === "team";
}

export default function ChannelSeverityControl({
  channelId,
  tier,
  defaultMinClass,
  initialFilter,
}: Props) {
  const router = useRouter();
  const safeTier: Tier = isTier(tier) ? tier : "starter";

  // The select's value: "" = inherit (filter null), or "I"/"II"/"III".
  const [value, setValue] = useState<"" | SeverityClass>(
    initialFilter?.min_class ?? "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Starter: read-only "Class II or higher (upgrade for per-channel routing)"
  if (safeTier === "starter") {
    return (
      <div style={styles.wrap}>
        <span style={styles.label}>Severity</span>
        <span style={styles.ro}>Class {defaultMinClass} or higher</span>
        <span style={styles.upsell}>(upgrade to Pro for per-channel routing)</span>
      </div>
    );
  }

  async function save(next: "" | SeverityClass) {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/account/channels?id=${encodeURIComponent(channelId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          severity_filter: next === "" ? null : { min_class: next },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Save failed.");
        return;
      }
      setSavedAt(Date.now());
      // Server-rendered /account reads the row again; refresh to reflect.
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Network error.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <span style={styles.label}>Severity</span>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as "" | SeverityClass;
          setValue(next);
          save(next);
        }}
        style={styles.select}
      >
        <option value="">Inherit (Class {defaultMinClass} or higher)</option>
        <option value="I">Class I only</option>
        <option value="II">Class II or higher</option>
        <option value="III">Class III or higher (everything)</option>
      </select>
      {pending && <span style={styles.status}>Saving…</span>}
      {!pending && savedAt !== null && <span style={styles.status}>Saved.</span>}
      {error && <span style={styles.err}>{error}</span>}
    </div>
  );
}
