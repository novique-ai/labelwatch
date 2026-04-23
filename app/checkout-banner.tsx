"use client";

import { useEffect, useState } from "react";

export default function CheckoutBanner() {
  const [state, setState] = useState<"success" | "cancel" | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("checkout");
    if (status === "success" || status === "cancel") {
      setState(status);
      setSessionId(params.get("session_id"));
    }
  }, []);

  async function openPortal() {
    if (!sessionId || portalLoading) return;
    setPortalLoading(true);
    setPortalError(null);
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data: { url?: string; error?: string } = await res.json();
      if (!res.ok || !data.url) {
        setPortalError(data.error ?? "portal_failed");
        setPortalLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setPortalError("portal_failed");
      setPortalLoading(false);
    }
  }

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
          {portalError && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-recall">
              Could not open portal ({portalError}).{" "}
              <a
                href="/contact"
                className="underline underline-offset-2 hover:opacity-80"
              >
                Send us a message
              </a>
              .
            </p>
          )}
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {success && sessionId && (
            <button
              type="button"
              onClick={openPortal}
              disabled={portalLoading}
              className="font-mono text-[10px] uppercase tracking-widest border border-paper/40 bg-paper/10 hover:bg-paper/20 px-3 py-2 disabled:opacity-50"
            >
              {portalLoading ? "Opening…" : "Manage subscription"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.delete("checkout");
              url.searchParams.delete("session_id");
              window.history.replaceState({}, "", url.toString());
              setState(null);
              setSessionId(null);
            }}
            className="font-mono text-[10px] uppercase tracking-widest underline underline-offset-2 opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
