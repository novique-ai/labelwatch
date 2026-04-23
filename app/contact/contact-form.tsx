"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

type Status = "idle" | "loading" | "success" | "error";

const CATEGORIES = [
  { value: "general", label: "General inquiry" },
  { value: "sales", label: "Sales / pricing" },
  { value: "support", label: "Support" },
  { value: "feedback", label: "Feature request / product feedback" },
  { value: "research", label: "Research interview (supplements operator)" },
  { value: "partnership", label: "Partnership / press" },
  { value: "other", label: "Other" },
] as const;

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [firm, setFirm] = useState("");
  const [category, setCategory] = useState<string>("general");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setErrorMsg("");

    try {
      const resp = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          firm,
          category,
          message,
          website, // honeypot
          referrer: document.referrer || null,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setStatus("error");
        const code = data?.error as string | undefined;
        setErrorMsg(
          code === "invalid_email"
            ? "That email doesn't look right."
            : code === "name_required"
              ? "Please add your name."
              : code === "message_too_short"
                ? "Add a few more words so we can help."
                : code === "invalid_category"
                  ? "Please pick a category."
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
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-2 border-ink p-6 bg-paper-deep/40"
      >
        <p className="font-display text-2xl text-ink leading-snug">
          Got it. Thanks.
        </p>
        <p className="mt-2 text-sm text-ink-muted font-body leading-relaxed">
          Your message is on the wire. We&apos;ll reply to{" "}
          <span className="font-mono text-ink">{email}</span> within one
          business day.
        </p>
      </motion.div>
    );
  }

  const inputBase =
    "w-full px-4 py-3 bg-paper border-2 border-ink text-ink font-body text-base placeholder:text-ink-muted focus:outline-none focus:border-recall transition-colors";
  const labelBase =
    "block font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted mb-2";

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Honeypot — hidden from real users, bots fill it. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-10000px",
          width: "1px",
          height: "1px",
          overflow: "hidden",
        }}
      >
        <label>
          Website
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className={labelBase} htmlFor="contact-name">
            Name
          </label>
          <input
            id="contact-name"
            type="text"
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={status === "loading"}
            placeholder="Jane Operator"
            className={inputBase}
          />
        </div>
        <div>
          <label className={labelBase} htmlFor="contact-email">
            Email
          </label>
          <input
            id="contact-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === "loading"}
            placeholder="you@brand.com"
            className={inputBase}
          />
        </div>
      </div>

      <div>
        <label className={labelBase} htmlFor="contact-firm">
          Firm <span className="text-ink-muted/60 normal-case tracking-normal">(optional)</span>
        </label>
        <input
          id="contact-firm"
          type="text"
          maxLength={200}
          value={firm}
          onChange={(e) => setFirm(e.target.value)}
          disabled={status === "loading"}
          placeholder="Acme Supplements"
          className={inputBase}
        />
      </div>

      <div>
        <label className={labelBase} htmlFor="contact-category">
          Category
        </label>
        <select
          id="contact-category"
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          disabled={status === "loading"}
          className={inputBase}
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelBase} htmlFor="contact-message">
          Message
        </label>
        <textarea
          id="contact-message"
          required
          rows={6}
          maxLength={5000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={status === "loading"}
          placeholder="Tell us what's on your mind…"
          className={`${inputBase} resize-y min-h-[140px]`}
        />
        <p className="mt-1 font-mono text-[10px] text-ink-muted">
          {message.length}/5000
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <button
          type="submit"
          disabled={status === "loading"}
          className="px-8 py-4 bg-recall text-paper font-mono uppercase tracking-widest text-sm border-2 border-recall hover:bg-recall-deep hover:border-recall-deep transition-colors duration-200 disabled:opacity-60"
        >
          {status === "loading" ? "Sending…" : "Send message"}
        </button>
        <AnimatePresence>
          {status === "error" && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-recall text-sm font-mono"
            >
              {errorMsg}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </form>
  );
}
