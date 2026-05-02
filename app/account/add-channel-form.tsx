"use client";

// Bead infrastructure-3mbd. Inline channel-add UI on /account.
//
// - Email + HTTP go through POST /api/account/channels.
// - Slack goes through /api/slack/oauth/init?return_to=account, which inserts
//   the row directly in the OAuth callback (no client-side POST needed).

import { useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";

type Type = "email" | "slack" | "http";

const styles: Record<string, CSSProperties> = {
  wrap: {
    background: "var(--color-bg-card)",
    border: "1px dashed var(--color-border-subtle)",
    padding: "20px 24px",
    borderRadius: 4,
    marginTop: 16,
  },
  heading: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "var(--color-text-muted)",
    margin: "0 0 12px",
  },
  typeRow: {
    display: "flex",
    gap: 8,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  typeBtn: {
    background: "transparent",
    border: "1px solid var(--color-border-subtle)",
    color: "var(--color-text-secondary)",
    padding: "8px 14px",
    borderRadius: 3,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  typeBtnActive: {
    background: "var(--color-bg-input)",
    border: "1px solid var(--color-text-primary)",
    color: "var(--color-text-primary)",
  },
  input: {
    width: "100%",
    background: "var(--color-bg-input)",
    border: "1px solid var(--color-border-subtle)",
    color: "var(--color-text-primary)",
    padding: "10px 12px",
    borderRadius: 3,
    fontSize: 13,
    fontFamily: "inherit",
    marginBottom: 12,
  },
  primary: {
    background: "var(--color-signal-red)",
    color: "#fff",
    border: "none",
    padding: "10px 18px",
    borderRadius: 3,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    cursor: "pointer",
    fontWeight: 500,
    fontFamily: "inherit",
    textDecoration: "none",
    display: "inline-block",
  },
  primaryDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  hint: {
    fontSize: 12,
    color: "var(--color-text-muted)",
    margin: "0 0 12px",
  },
  error: {
    color: "var(--color-signal-red)",
    fontSize: 12,
    marginTop: 8,
  },
};

export default function AddChannelForm() {
  const router = useRouter();
  const [type, setType] = useState<Type>("email");
  const [email, setEmail] = useState("");
  const [httpUrl, setHttpUrl] = useState("");
  const [httpAuth, setHttpAuth] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setEmail("");
    setHttpUrl("");
    setHttpAuth("");
    setError(null);
  }

  async function submit() {
    setError(null);
    let body: { channel: { type: string; config: Record<string, unknown> } };
    if (type === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError("Enter a valid email address.");
        return;
      }
      body = { channel: { type: "email", config: { address: email } } };
    } else if (type === "http") {
      if (!httpUrl.startsWith("https://")) {
        setError("URL must start with https://");
        return;
      }
      body = {
        channel: {
          type: "http",
          config: {
            url: httpUrl,
            auth_header: httpAuth.trim() || null,
          },
        },
      };
    } else {
      // Slack handled by OAuth init link, not this submit.
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/account/channels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Add failed.");
        return;
      }
      reset();
      // For HTTP, surface the signing secret on the dashboard (same pattern
      // as /onboard). Email — just refresh.
      if (data.signing_secret) {
        router.push(`/account?signing_secret=${encodeURIComponent(data.signing_secret)}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      console.error(err);
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <p style={styles.heading}>Add a channel</p>

      <div style={styles.typeRow}>
        {(["email", "slack", "http"] as Type[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setType(t);
              setError(null);
            }}
            style={{
              ...styles.typeBtn,
              ...(type === t ? styles.typeBtnActive : {}),
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {type === "email" && (
        <>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alerts@yourfirm.com"
            style={styles.input}
          />
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            style={{
              ...styles.primary,
              ...(submitting ? styles.primaryDisabled : {}),
            }}
          >
            {submitting ? "Adding…" : "Add email channel"}
          </button>
        </>
      )}

      {type === "slack" && (
        <>
          <p style={styles.hint}>
            We&apos;ll redirect you to authorize the LabelWatch Slack app, you pick the channel,
            then come back here. Posts go to whichever channel you choose.
          </p>
          <a href="/api/slack/oauth/init?return_to=account" style={styles.primary}>
            Connect Slack →
          </a>
        </>
      )}

      {type === "http" && (
        <>
          <input
            type="url"
            value={httpUrl}
            onChange={(e) => setHttpUrl(e.target.value)}
            placeholder="https://your-service.example.com/labelwatch"
            style={styles.input}
          />
          <input
            type="text"
            value={httpAuth}
            onChange={(e) => setHttpAuth(e.target.value)}
            placeholder="Authorization header (optional, e.g. Bearer ...)"
            style={styles.input}
          />
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            style={{
              ...styles.primary,
              ...(submitting ? styles.primaryDisabled : {}),
            }}
          >
            {submitting ? "Adding…" : "Add HTTP channel"}
          </button>
          <p style={{ ...styles.hint, marginTop: 8 }}>
            We&apos;ll show the HMAC signing secret once after creation. Save it — you&apos;ll need it
            to verify the X-LabelWatch-Signature header on incoming deliveries.
          </p>
        </>
      )}

      {error && <p style={styles.error}>{error}</p>}
    </div>
  );
}
