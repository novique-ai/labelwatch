import Link from "next/link";
import type { Metadata } from "next";
import ContactForm from "./contact-form";

export const metadata: Metadata = {
  title: "Contact — LabelWatch",
  description:
    "Talk to the LabelWatch team. Sales, support, feature requests, and supplements-industry research interviews.",
};

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-2xl px-6 md:px-12 py-12 md:py-20">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted mb-3">
          <Link
            href="/"
            className="underline decoration-recall/40 underline-offset-2 hover:decoration-recall"
          >
            ← LabelWatch
          </Link>
        </p>

        <h1 className="font-display text-4xl md:text-5xl leading-tight mb-4">
          Send us a message.
        </h1>
        <p className="font-body text-ink-muted mb-10 leading-relaxed">
          Sales questions, product feedback, partnership pitches, or research
          interviews — pick a category and tell us what you need. We read every
          message and reply within one business day.
        </p>

        <ContactForm />

        <p className="mt-10 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted">
          Existing customers: include your account email so we can pull your
          subscription up before replying.
        </p>
      </div>
    </main>
  );
}
