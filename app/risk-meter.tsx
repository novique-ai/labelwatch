"use client";

import { motion } from "motion/react";

const TICK_LABELS = ["10", "8", "6", "4", "2", "0"];

export default function RiskMeter({
  count,
  class1Count,
}: {
  count: number;
  class1Count: number;
}) {
  const fillPct = Math.min(count, 10) / 10 * 100;

  return (
    <div>
      <div
        style={{
          width: 240,
          height: 460,
          margin: "0 auto",
          position: "relative",
          border: "1px solid #2a2a26",
          background: "linear-gradient(180deg, rgba(198,58,31,0.18), rgba(20,20,18,0.4))",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        {/* Tick scale overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent 0, transparent 22px, rgba(255,255,255,0.04) 22px, rgba(255,255,255,0.04) 23px)",
          }}
        />

        {/* Animated fill */}
        <motion.div
          initial={{ height: "0%" }}
          animate={{ height: `${fillPct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            background:
              "linear-gradient(180deg, transparent, rgba(198,58,31,0.55) 30%, rgba(198,58,31,0.85))",
            borderTop: "2px solid #c63a1f",
          }}
        />

        {/* Reading */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "36%",
            textAlign: "center",
            color: "#ece5d6",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-instrument-serif), serif",
              fontSize: 124,
              fontWeight: 400,
              lineHeight: 0.9,
              color: "#fff",
              letterSpacing: -3,
            }}
          >
            {count}
          </div>
          <div
            style={{
              fontFamily: "var(--font-jetbrains), monospace",
              fontSize: 10,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "#ece5d6",
              marginTop: 8,
            }}
          >
            recalls
            <br />
            this month
          </div>
        </div>

        {/* Tick labels — positioned outside the meter frame, hidden on mobile via inline style */}
        <div
          className="meter-ticks"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            right: -36,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            fontFamily: "var(--font-jetbrains), monospace",
            fontSize: 9,
            letterSpacing: 1.2,
            color: "#807a6c",
          }}
        >
          {TICK_LABELS.map((t) => (
            <span key={t}>{t} ─</span>
          ))}
        </div>
        <style>{`
          @media (max-width: 959px) {
            .meter-ticks { display: none !important; }
          }
        `}</style>
      </div>

      <div
        style={{
          textAlign: "center",
          marginTop: 14,
          fontFamily: "var(--font-jetbrains), monospace",
          fontSize: 10,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: "#807a6c",
        }}
      >
        {class1Count} Class I · in your watchlist
      </div>
    </div>
  );
}
