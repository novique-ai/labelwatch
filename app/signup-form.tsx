"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

type Tier = "starter" | "pro" | "team";
type Status = "idle" | "loading" | "success" | "error";

export default function SignupForm({
  tier = "starter",
  campaign,
  variant = "primary",
  className = "",
}: {
  tier?: Tier;
  campaign?: string;
  variant?: "primary" | "compact";
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

  if (variant === "compact") {
    return (
      <form onSubmit={onSubmit} className={className}>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@brand.com"
            disabled={status === "loading" || status === "success"}
            className="flex-1 px-4 py-3 bg-paper border border-ink/30 text-ink font-mono text-sm focus:outline-none focus:border-recall focus:ring-1 focus:ring-recall transition-colors"
          />
          <button
            type="submit"
            disabled={status === "loading" || status === "success"}
            className="px-5 py-3 bg-ink text-paper font-mono uppercase tracking-wide text-xs hover:bg-recall transition-colors duration-200"
          >
            {status === "loading"
              ? "Adding…"
              : status === "success"
                ? "On the list"
                : "Get early access"}
          </button>
        </div>
        <AnimatePresence>
          {status === "error" && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-2 text-recall text-xs font-mono"
            >
              {errorMsg}
            </motion.p>
          )}
        </AnimatePresence>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} className={className}>
      <div className="flex flex-col md:flex-row gap-3 items-stretch">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@brand.com"
          disabled={status === "loading" || status === "success"}
          aria-label="Email address"
          className="flex-1 px-5 py-4 bg-paper border-2 border-ink text-ink font-mono text-base placeholder:text-ink-muted focus:outline-none focus:border-recall transition-colors"
        />
        <button
          type="submit"
          disabled={status === "loading" || status === "success"}
          className="px-8 py-4 bg-recall text-paper font-mono uppercase tracking-widest text-sm border-2 border-recall hover:bg-recall-deep hover:border-recall-deep transition-colors duration-200 whitespace-nowrap"
        >
          {status === "loading"
            ? "Adding to the list…"
            : status === "success"
              ? "You're on the list"
              : "Request early access"}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {status === "success" && (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 p-4 border border-ink/20 bg-paper-deep/40"
          >
            <p className="font-display text-lg text-ink leading-snug">
              Thanks. You&apos;re on the wire.
            </p>
            <p className="mt-1 text-sm text-ink-muted font-body">
              We launch in early access in 4 weeks. We&apos;ll send you a single
              email when the gates open. No drip. No nonsense.
            </p>
          </motion.div>
        )}
        {status === "error" && (
          <motion.p
            key="error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 text-recall text-sm font-mono"
          >
            {errorMsg}
          </motion.p>
        )}
      </AnimatePresence>
    </form>
  );
}
