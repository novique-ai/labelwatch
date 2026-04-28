"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

type Tier = "starter" | "pro" | "team";
type Status = "idle" | "loading" | "success" | "error";

export default function SignupForm({
  tier = "starter",
  campaign,
  className = "",
}: {
  tier?: Tier;
  campaign?: string;
  className?: string;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setErrorMsg("");

    try {
      const params = new URLSearchParams(window.location.search);
      const resp = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          tier,
          referrer: document.referrer || null,
          utm_source: params.get("utm_source"),
          utm_campaign: params.get("utm_campaign") || campaign || null,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setStatus("error");
        setErrorMsg(
          data?.error === "invalid_email"
            ? "That email doesn't look right."
            : "Something went sideways. Try again in a sec.",
        );
        return;
      }
      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMsg("Network blip. Try once more.");
    }
  }

  if (status === "success") {
    return (
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className={className}
        style={{
          fontFamily: "var(--font-jetbrains), monospace",
          fontSize: 12,
          color: "#5fd07a",
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        Got it — we'll email you when LabelWatch opens.
      </motion.div>
    );
  }

  return (
    <form onSubmit={onSubmit} className={className}>
      <div
        style={{
          display: "flex",
          gap: 8,
          maxWidth: 360,
        }}
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@brand.com"
          disabled={status === "loading"}
          aria-label="Email address"
          style={{
            flex: 1,
            padding: "13px 14px",
            background: "rgba(20,20,18,0.6)",
            border: "1px solid #2a2a26",
            color: "#ece5d6",
            fontFamily: "var(--font-jetbrains), monospace",
            fontSize: 12,
            borderRadius: 2,
            outline: "none",
            minWidth: 0,
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "#c63a1f";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "#2a2a26";
          }}
        />
        <button
          type="submit"
          disabled={status === "loading"}
          style={{
            background: status === "loading" ? "#a82e16" : "#c63a1f",
            color: "#fff",
            padding: "13px 18px",
            border: "none",
            fontFamily: "var(--font-jetbrains), monospace",
            fontSize: 11,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            fontWeight: 600,
            cursor: status === "loading" ? "not-allowed" : "pointer",
            borderRadius: 2,
            whiteSpace: "nowrap",
            transition: "background 0.15s ease",
          }}
          onMouseEnter={(e) => {
            if (status !== "loading") e.currentTarget.style.background = "#a82e16";
          }}
          onMouseLeave={(e) => {
            if (status !== "loading") e.currentTarget.style.background = "#c63a1f";
          }}
        >
          {status === "loading" ? "Adding..." : "Request access →"}
        </button>
      </div>

      <AnimatePresence>
        {status === "error" && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              marginTop: 8,
              fontFamily: "var(--font-jetbrains), monospace",
              fontSize: 10,
              color: "#c63a1f",
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            {errorMsg}
          </motion.p>
        )}
      </AnimatePresence>
    </form>
  );
}
