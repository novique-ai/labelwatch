"use client";

// Bead infrastructure-3mbd. Per-channel "Remove" button on /account.

import { useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";

const styles: Record<string, CSSProperties> = {
  btn: {
    background: "transparent",
    border: "1px solid var(--color-border-subtle)",
    color: "var(--color-text-muted)",
    padding: "4px 10px",
    borderRadius: 3,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  btnDanger: {
    color: "var(--color-signal-red)",
    borderColor: "var(--color-signal-red)",
  },
  btnDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  error: {
    color: "var(--color-signal-red)",
    fontSize: 11,
    marginTop: 4,
  },
};

export default function ChannelRowActions({
  channelId,
  label,
}: {
  channelId: string;
  label: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/account/channels?id=${encodeURIComponent(channelId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Delete failed.");
        return;
      }
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Network error.");
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        style={styles.btn}
        aria-label={`Remove ${label}`}
      >
        Remove
      </button>
    );
  }

  return (
    <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <button
        type="button"
        onClick={remove}
        disabled={submitting}
        style={{ ...styles.btn, ...styles.btnDanger, ...(submitting ? styles.btnDisabled : {}) }}
      >
        {submitting ? "…" : "Confirm"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={submitting}
        style={{ ...styles.btn, ...(submitting ? styles.btnDisabled : {}) }}
      >
        Cancel
      </button>
      {error && <span style={styles.error}>{error}</span>}
    </div>
  );
}
