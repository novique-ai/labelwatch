"use client";

import { useEffect, useState } from "react";

export default function CheckoutBanner() {
  const [state, setState] = useState<"success" | "cancel" | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("checkout");
    if (status === "success" || status === "cancel") {
      setState(status);
    }
  }, []);

  if (!state) return null;

  const success = state === "success";
  return (
    <div
      className={`border-b-2 ${
        success ? "bg-ink text-paper border-recall" : "bg-paper-deep border-ink"
      }`}
    >
      <div className="mx-auto max-w-6xl px-6 md:px-12 py-4 flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] mb-1 opacity-70">
            {success ? "Subscription confirmed" : "Checkout cancelled"}
          </p>
          <p
            className={`font-display ${
              success ? "text-xl" : "text-base"
            } leading-snug`}
          >
            {success
              ? "Thanks — you're in. Check your email for a receipt."
              : "No charge made. Browse the wire, or try a different tier."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            const url = new URL(window.location.href);
            url.searchParams.delete("checkout");
            url.searchParams.delete("session_id");
            window.history.replaceState({}, "", url.toString());
            setState(null);
          }}
          className="font-mono text-[10px] uppercase tracking-widest underline underline-offset-2 opacity-70 hover:opacity-100"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
