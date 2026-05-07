"use client";

// Client island for the invite-by-email form on /account/team.
// Bead infrastructure-cin7.

import { useState } from "react";
import type { CSSProperties } from "react";

export default function InviteForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");
    try {
      const resp = await fetch("/api/account/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await resp.json() as { ok?: boolean; error?: string };
      if (resp.ok && json.ok) {
        setStatus("sent");
        setEmail("");
      } else {
        setStatus("error");
        setErrorMsg(json.error ?? "invite_failed");
      }
    } catch {
      setStatus("error");
      setErrorMsg("network_error");
    }
  }

  const inputStyle: CSSProperties = {
    background: "var(--color-bg-input)",
    border: "1px solid var(--color-border-subtle)",
    color: "var(--color-text-primary)",
    padding: "10px 14px",
    borderRadius: 4,
    fontSize: 13,
    fontFamily: "var(--font-jetbrains), monospace",
    flex: 1,
    minWidth: 0,
  };

  const btnStyle: CSSProperties = {
    background: "var(--color-signal-red)",
    color: "#fff",
    border: "none",
    padding: "10px 20px",
    borderRadius: 4,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    cursor: status === "sending" ? "not-allowed" : "pointer",
    fontFamily: "var(--font-jetbrains), monospace",
    opacity: status === "sending" ? 0.6 : 1,
  };

  if (status === "sent") {
    return (
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>
        Invite sent to <strong>{email || "your teammate"}</strong>. They&apos;ll receive a link valid for 7 days.{" "}
        <button
          style={{ background: "none", border: "none", color: "var(--color-signal-red)", cursor: "pointer", fontSize: 13, padding: 0, fontFamily: "inherit" }}
          onClick={() => { setStatus("idle"); setEmail(""); }}
        >
          Send another →
        </button>
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <input
        type="email"
        required
        placeholder="colleague@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={inputStyle}
        disabled={status === "sending"}
      />
      <button type="submit" style={btnStyle} disabled={status === "sending"}>
        {status === "sending" ? "Sending…" : "Send invite →"}
      </button>
      {status === "error" && (
        <span style={{ fontSize: 12, color: "var(--color-signal-red)" }}>{errorMsg}</span>
      )}
    </form>
  );
}
