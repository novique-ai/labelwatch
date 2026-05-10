"use client";

import { useState } from "react";

export default function SignInForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "not_found" | "error">("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/account/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        redirect: "follow",
      });
      if (res.ok || res.redirected) {
        window.location.href = res.url || "/account";
        return;
      }
      const data = await res.json().catch(() => ({}));
      setStatus(data.error === "not_found" ? "not_found" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column" as const, gap: 10, maxWidth: 340 }}>
      <input
        type="email"
        value={email}
        onChange={(e) => { setEmail(e.target.value); setStatus("idle"); }}
        placeholder="Email address on your account"
        required
        disabled={status === "loading"}
        style={{
          padding: "10px 14px",
          fontFamily: "monospace",
          fontSize: 12,
          border: "1px solid #d4c9b8",
          background: "#faf8f5",
          color: "#2c2924",
          outline: "none",
          width: "100%",
          boxSizing: "border-box" as const,
        }}
      />
      <button
        type="submit"
        disabled={status === "loading"}
        style={{
          padding: "10px 14px",
          fontFamily: "monospace",
          fontSize: 11,
          textTransform: "uppercase" as const,
          letterSpacing: "0.2em",
          background: "#2c2924",
          color: "#faf8f5",
          border: "none",
          cursor: status === "loading" ? "not-allowed" : "pointer",
          opacity: status === "loading" ? 0.6 : 1,
        }}
      >
        {status === "loading" ? "Signing in…" : "Access my account →"}
      </button>
      {status === "not_found" && (
        <p style={{ margin: 0, fontSize: 11, fontFamily: "monospace", color: "#c63a1f" }}>
          No account found for that email.
        </p>
      )}
      {status === "error" && (
        <p style={{ margin: 0, fontSize: 11, fontFamily: "monospace", color: "#c63a1f" }}>
          Something went wrong — try again.
        </p>
      )}
    </form>
  );
}
