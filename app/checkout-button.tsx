"use client";

import { useState } from "react";
import type { Tier } from "@/lib/stripe";

type Status = "idle" | "loading" | "error";

export default function CheckoutButton({
  tier,
  label,
  accent = false,
  className = "",
}: {
  tier: Tier;
  label: string;
  accent?: boolean;
  className?: string;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function onClick() {
    if (status === "loading") return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const resp = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.url) {
        setStatus("error");
        setErrorMsg(
          data?.error === "stripe_not_configured"
            ? "Checkout is being configured. Join the waitlist for now."
            : "Couldn't start checkout. Try again in a moment.",
        );
        return;
      }
      window.location.href = data.url as string;
    } catch {
      setStatus("error");
      setErrorMsg("Network blip. Try once more.");
    }
  }

  const base =
    "w-full px-5 py-3 font-mono uppercase tracking-widest text-xs border-2 transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60";
  const variant = accent
    ? "bg-recall text-paper border-recall hover:bg-recall-deep hover:border-recall-deep"
    : "bg-ink text-paper border-ink hover:bg-recall hover:border-recall";

  return (
    <div className={className}>
      <button
        type="button"
        onClick={onClick}
        disabled={status === "loading"}
        className={`${base} ${variant}`}
      >
        {status === "loading" ? "Opening checkout…" : label}
      </button>
      {status === "error" && (
        <p className="mt-2 text-recall text-xs font-mono">{errorMsg}</p>
      )}
    </div>
  );
}
