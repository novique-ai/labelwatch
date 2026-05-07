"use client";

// Client island for /account/rules — rule list with delete buttons + add form.
// Bead infrastructure-yo7k.

import { useState } from "react";
import type { CSSProperties } from "react";
import type { AlertRuleRow } from "@/types/database.types";

type Props = { initialRules: AlertRuleRow[]; maxRules: number };

export default function RulesManager({ initialRules, maxRules }: Props) {
  const [rules, setRules] = useState<AlertRuleRow[]>(initialRules);
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [addStatus, setAddStatus] = useState<"idle" | "saving" | "error">("idle");
  const [addError, setAddError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddStatus("saving");
    setAddError("");
    try {
      const resp = await fetch("/api/account/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), keywords }),
      });
      const json = await resp.json() as { ok?: boolean; rule?: AlertRuleRow; error?: string };
      if (resp.ok && json.ok && json.rule) {
        setRules((prev) => [...prev, json.rule!]);
        setName("");
        setKeywords("");
        setAddStatus("idle");
      } else {
        setAddStatus("error");
        setAddError(json.error ?? "save_failed");
      }
    } catch {
      setAddStatus("error");
      setAddError("network_error");
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const resp = await fetch(`/api/account/rules?id=${id}`, { method: "DELETE" });
      if (resp.ok) {
        setRules((prev) => prev.filter((r) => r.id !== id));
      }
    } finally {
      setDeletingId(null);
    }
  }

  const atCap = rules.length >= maxRules;

  const s: Record<string, CSSProperties> = {
    ruleRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "12px 0", borderBottom: "1px solid var(--color-border-subtle)", gap: 12 },
    ruleName: { fontSize: 13, fontWeight: 500, marginBottom: 4 },
    keywords: { fontSize: 11, color: "var(--color-text-muted)", fontFamily: "var(--font-jetbrains), monospace" },
    deleteBtn: { background: "none", border: "1px solid var(--color-border-subtle)", color: "var(--color-text-muted)", cursor: "pointer", padding: "4px 10px", borderRadius: 3, fontSize: 11, fontFamily: "inherit", flexShrink: 0 },
    input: { background: "var(--color-bg-input)", border: "1px solid var(--color-border-subtle)", color: "var(--color-text-primary)", padding: "10px 14px", borderRadius: 4, fontSize: 13, fontFamily: "var(--font-jetbrains), monospace", width: "100%" },
    textarea: { background: "var(--color-bg-input)", border: "1px solid var(--color-border-subtle)", color: "var(--color-text-primary)", padding: "10px 14px", borderRadius: 4, fontSize: 13, fontFamily: "var(--font-jetbrains), monospace", width: "100%", resize: "vertical" as const, minHeight: 72 },
    label: { fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase" as const, color: "var(--color-text-muted)", display: "block", marginBottom: 6 },
    addBtn: { background: "var(--color-signal-red)", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 4, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" as const, cursor: "pointer", fontFamily: "inherit" },
    empty: { fontSize: 13, color: "var(--color-text-muted)", fontStyle: "italic", padding: "12px 0" },
    cap: { fontSize: 12, color: "var(--color-text-muted)", marginTop: 8 },
  };

  return (
    <>
      {rules.length === 0 ? (
        <p style={s.empty}>No custom rules yet. Add one below to catch recalls your standard watching scope would miss.</p>
      ) : (
        <div>
          {rules.map((rule, i) => (
            <div key={rule.id} style={{ ...s.ruleRow, borderBottom: i < rules.length - 1 ? "1px solid var(--color-border-subtle)" : "none" }}>
              <div style={{ flex: 1 }}>
                <div style={s.ruleName}>{rule.name}</div>
                <div style={s.keywords}>{rule.keywords.join(", ")}</div>
              </div>
              <button
                style={s.deleteBtn}
                onClick={() => handleDelete(rule.id)}
                disabled={deletingId === rule.id}
              >
                {deletingId === rule.id ? "…" : "Remove"}
              </button>
            </div>
          ))}
          <p style={s.cap}>{rules.length} of {maxRules} rules</p>
        </div>
      )}

      {!atCap && (
        <form onSubmit={handleAdd} style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={s.label}>Rule name</label>
            <input
              style={s.input}
              type="text"
              required
              placeholder="e.g. Whey protein watch"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={addStatus === "saving"}
            />
          </div>
          <div>
            <label style={s.label}>Keywords (comma-separated)</label>
            <textarea
              style={s.textarea}
              required
              placeholder="whey, isolate, protein concentrate"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              disabled={addStatus === "saving"}
            />
            <p style={{ ...s.cap, marginTop: 4 }}>
              Matches any recall where product description or reason contains one of these words or phrases (case-insensitive).
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button type="submit" style={{ ...s.addBtn, opacity: addStatus === "saving" ? 0.6 : 1 }} disabled={addStatus === "saving"}>
              {addStatus === "saving" ? "Saving…" : "Add rule →"}
            </button>
            {addStatus === "error" && (
              <span style={{ fontSize: 12, color: "var(--color-signal-red)" }}>{addError}</span>
            )}
          </div>
        </form>
      )}

      {atCap && (
        <p style={{ ...s.cap, marginTop: 16 }}>Maximum of {maxRules} rules reached.</p>
      )}
    </>
  );
}
