"use client";

import { useState } from "react";
import type { Recall } from "@/lib/recalls";

function ClassPill({ cls }: { cls: string }) {
  const bg =
    cls === "Class I"
      ? "#c63a1f"
      : cls === "Class II"
        ? "#3a3a3a"
        : "#8a8a82";
  const label =
    cls === "Class I"
      ? "CLASS I"
      : cls === "Class II"
        ? "CLASS II"
        : "CLASS III";
  return (
    <span
      style={{
        background: bg,
        color: "#fff",
        fontFamily: "var(--font-jetbrains), monospace",
        fontSize: 10,
        fontWeight: 600,
        padding: "3px 7px",
        letterSpacing: 0.6,
        display: "inline-block",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

// Lead times are synthetic until the LabelWatch poller emits real delivery timestamps.
// TODO: replace with actual hours delta from poller once available.
const SYNTHETIC_LEAD_HOURS = [71, 96, 54];

function RecallCard({
  recall,
  leadHours,
}: {
  recall: Recall;
  leadHours: number;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `1px solid ${hovered ? "#3a3a36" : "#2a2a26"}`,
        padding: "16px 18px",
        background: hovered ? "rgba(28,28,24,0.6)" : "rgba(20,20,18,0.5)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 150,
        cursor: "pointer",
        transition: "border-color 0.15s ease, background 0.15s ease",
        minWidth: 260,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <ClassPill cls={recall.classification} />
        <span
          style={{
            color: "#5fd07a",
            fontFamily: "var(--font-jetbrains), monospace",
            fontSize: 11,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          +{leadHours} h ahead
        </span>
      </div>
      <div
        style={{
          fontFamily: "var(--font-instrument-serif), serif",
          fontSize: 22,
          lineHeight: 1.15,
          color: "#ece5d6",
        }}
      >
        {recall.firm || "Firm undisclosed"}
      </div>
      <div
        style={{
          fontFamily: "var(--font-jetbrains), monospace",
          fontSize: 10,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          color: "#9a9485",
          lineHeight: 1.5,
          marginTop: "auto",
        }}
      >
        {recall.reason}
      </div>
    </div>
  );
}

export default function RecallStrip({
  recalls,
  total,
}: {
  recalls: Recall[];
  total: number;
}) {
  const shown = recalls.slice(0, 3);

  return (
    <div
      style={{
        borderTop: "1px solid #2a2a26",
        padding: "24px 40px",
        background: "rgba(10,10,8,0.65)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          fontFamily: "var(--font-jetbrains), monospace",
          fontSize: 10,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: "#807a6c",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <span>● Found this month — you didn't get the FDA email yet</span>
        <span>Showing {shown.length} of {total} · See the full wire →</span>
      </div>

      {/* Horizontal scroller on mobile, 3-col grid on desktop */}
      <div
        className="recall-cards-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 14,
        }}
      >
        {shown.map((r, i) => (
          <RecallCard
            key={r.recallNumber || `${r.firm}-${i}`}
            recall={r}
            leadHours={SYNTHETIC_LEAD_HOURS[i] ?? 48}
          />
        ))}
      </div>
    </div>
  );
}
