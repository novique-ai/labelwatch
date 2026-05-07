"use client";

// Client island for /account/apikeys — list, create, and revoke API keys.
// Bead infrastructure-2mkx.

import { useState } from "react";
import type { CSSProperties } from "react";
import type { ApiKeyRow } from "@/types/database.types";

type DisplayKey = Pick<ApiKeyRow, "id" | "name" | "created_at" | "last_used_at">;
type Props = { initialKeys: DisplayKey[]; maxKeys: number };

export default function ApiKeysManager({ initialKeys, maxKeys }: Props) {
  const [keys, setKeys] = useState<DisplayKey[]>(initialKeys);
  const [name, setName] = useState("");
  const [createStatus, setCreateStatus] = useState<"idle" | "creating" | "error">("idle");
  const [createError, setCreateError] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null); // shown ONCE after creation
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateStatus("creating");
    setCreateError("");
    setNewKey(null);
    try {
      const resp = await fetch("/api/account/apikeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const json = await resp.json() as { ok?: boolean; key?: string; id?: string; name?: string; created_at?: string; error?: string };
      if (resp.ok && json.ok && json.key) {
        setNewKey(json.key);
        setKeys((prev) => [...prev, { id: json.id!, name: json.name!, created_at: json.created_at!, last_used_at: null }]);
        setName("");
        setCreateStatus("idle");
      } else {
        setCreateStatus("error");
        setCreateError(json.error ?? "create_failed");
      }
    } catch {
      setCreateStatus("error");
      setCreateError("network_error");
    }
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    try {
      const resp = await fetch(`/api/account/apikeys?id=${id}`, { method: "DELETE" });
      if (resp.ok) {
        setKeys((prev) => prev.filter((k) => k.id !== id));
        if (newKey) setNewKey(null); // clear displayed new key if it was just revoked
      }
    } finally {
      setRevokingId(null);
    }
  }

  function copyKey() {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const atCap = keys.length >= maxKeys;

  const s: Record<string, CSSProperties> = {
    keyRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "12px 0", gap: 12 },
    keyName: { fontSize: 13, fontWeight: 500, marginBottom: 2 },
    meta: { fontSize: 11, color: "var(--color-text-muted)" },
    revokeBtn: { background: "none", border: "1px solid var(--color-border-subtle)", color: "var(--color-text-muted)", cursor: "pointer", padding: "4px 10px", borderRadius: 3, fontSize: 11, fontFamily: "inherit", flexShrink: 0 },
    input: { background: "var(--color-bg-input)", border: "1px solid var(--color-border-subtle)", color: "var(--color-text-primary)", padding: "10px 14px", borderRadius: 4, fontSize: 13, fontFamily: "var(--font-jetbrains), monospace", flex: 1, minWidth: 0 },
    createBtn: { background: "var(--color-signal-red)", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 4, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" as const, cursor: "pointer", fontFamily: "inherit" },
    copyBtn: { background: "none", border: "1px solid var(--color-signal-red)", color: "var(--color-signal-red)", cursor: "pointer", padding: "6px 12px", borderRadius: 3, fontSize: 11, fontFamily: "inherit" },
    newKeyBox: { background: "var(--color-bg-base)", border: "1px solid var(--color-signal-red)", borderRadius: 4, padding: "16px 20px", margin: "16px 0 0" },
    newKeyPre: { fontFamily: "var(--font-jetbrains), monospace", fontSize: 12, wordBreak: "break-all" as const, margin: "8px 0", color: "var(--color-text-primary)" },
    empty: { fontSize: 13, color: "var(--color-text-muted)", fontStyle: "italic", padding: "12px 0" },
    cap: { fontSize: 12, color: "var(--color-text-muted)", marginTop: 8 },
  };

  return (
    <>
      {newKey && (
        <div style={s.newKeyBox}>
          <p style={{ fontSize: 12, color: "var(--color-signal-red)", margin: "0 0 4px", fontWeight: 600 }}>
            ⚠ Save this key now — it will not be shown again.
          </p>
          <pre style={s.newKeyPre}>{newKey}</pre>
          <button style={s.copyBtn} onClick={copyKey}>{copied ? "Copied!" : "Copy →"}</button>
        </div>
      )}

      {keys.length === 0 ? (
        <p style={s.empty}>No API keys yet.</p>
      ) : (
        <div>
          {keys.map((k, i) => (
            <div key={k.id} style={{ ...s.keyRow, borderBottom: i < keys.length - 1 ? "1px solid var(--color-border-subtle)" : "none" }}>
              <div style={{ flex: 1 }}>
                <div style={s.keyName}>{k.name}</div>
                <div style={s.meta}>
                  Created {new Date(k.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  {k.last_used_at && ` · Last used ${new Date(k.last_used_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                </div>
              </div>
              <button
                style={s.revokeBtn}
                onClick={() => handleRevoke(k.id)}
                disabled={revokingId === k.id}
              >
                {revokingId === k.id ? "…" : "Revoke"}
              </button>
            </div>
          ))}
          <p style={s.cap}>{keys.length} of {maxKeys} keys</p>
        </div>
      )}

      {!atCap && (
        <form onSubmit={handleCreate} style={{ marginTop: 24, display: "flex", gap: 10, alignItems: "center" }}>
          <input
            style={s.input}
            type="text"
            required
            placeholder="Key name (e.g. Production integration)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={createStatus === "creating"}
          />
          <button type="submit" style={{ ...s.createBtn, opacity: createStatus === "creating" ? 0.6 : 1 }} disabled={createStatus === "creating"}>
            {createStatus === "creating" ? "Creating…" : "Create →"}
          </button>
          {createStatus === "error" && (
            <span style={{ fontSize: 12, color: "var(--color-signal-red)", flexShrink: 0 }}>{createError}</span>
          )}
        </form>
      )}

      {atCap && (
        <p style={{ ...s.cap, marginTop: 16 }}>Maximum of {maxKeys} active keys. Revoke one to create a new key.</p>
      )}
    </>
  );
}
