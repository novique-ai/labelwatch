"use client";

import { useState } from "react";

export default function SignInForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "sent" | "error"
  >("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/account/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      // Always show check-email — no account enumeration (infra-lodo).
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div style={{ maxWidth: 340 }}>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            fontFamily: "var(--font-jetbrains), monospace",
            color: "#ece5d6",
            lineHeight: 1.5,
          }}
        >
          If an account exists for that email, we sent a sign-in link. Check
          your inbox (and spam) — the link expires in 15 minutes.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{
        display: "flex",
        flexDirection: "column" as const,
        gap: 10,
        maxWidth: 340,
      }}
    >
      <input
        type="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setStatus("idle");
        }}
        placeholder="Email address on your account"
        required
        disabled={status === "loading"}
        style={{
          padding: "10px 14px",
          fontFamily: "monospace",
          fontSize: 12,
          border: "1px solid #3a3a36",
          background: "#141412",
          color: "#ece5d6",
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
          background: "#c63a1f",
          color: "#fff",
          border: "none",
          cursor: status === "loading" ? "not-allowed" : "pointer",
          opacity: status === "loading" ? 0.6 : 1,
        }}
      >
        {status === "loading" ? "Sending link…" : "Email me a sign-in link →"}
      </button>
      {status === "error" && (
        <p
          style={{
            margin: 0,
            fontSize: 11,
            fontFamily: "monospace",
            color: "#c63a1f",
          }}
        >
          Something went wrong — try again.
        </p>
      )}
    </form>
  );
}
