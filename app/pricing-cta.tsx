"use client";

export default function PricingCta({
  accent,
}: {
  accent: boolean;
}) {
  return (
    <a
      href="#waitlist"
      style={{
        display: "block",
        textAlign: "center",
        padding: "13px 18px",
        background: accent ? "#c63a1f" : "transparent",
        border: `1px solid ${accent ? "#c63a1f" : "#2a2a26"}`,
        color: accent ? "#fff" : "#9a9485",
        fontFamily: "var(--font-jetbrains), monospace",
        fontSize: 10,
        letterSpacing: 1.5,
        textTransform: "uppercase",
        fontWeight: 600,
        textDecoration: "none",
        transition: "background 0.15s ease, border-color 0.15s ease",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.background = accent ? "#a82e16" : "rgba(20,20,18,0.6)";
        if (!accent) el.style.borderColor = "#3a3a36";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.background = accent ? "#c63a1f" : "transparent";
        if (!accent) el.style.borderColor = "#2a2a26";
      }}
    >
      Notify me at launch
    </a>
  );
}
