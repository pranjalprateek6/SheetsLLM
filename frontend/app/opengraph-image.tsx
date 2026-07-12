import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "SheetsLLM: Clean the same spreadsheet once, never again";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const VIOLET = "#7C5CE8";
const LAVENDER = "#A78BFA";
const INK = "#1B1A24";
const MUTED = "#6b6a76";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #ffffff 0%, #F5F7FA 60%, #EDE9FB 100%)",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        {/* Header: mark + wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="72" height="72" viewBox="0 0 48 48" fill="none">
            <path
              d="M15 5 H27.5 L39 16.5 V38 a5 5 0 0 1 -5 5 H15 a5 5 0 0 1 -5 -5 V10 a5 5 0 0 1 5 -5 Z"
              fill={VIOLET}
            />
            <path d="M27.5 5 L39 16.5 H30.5 a3 3 0 0 1 -3 -3 Z" fill={LAVENDER} />
            <path
              d="M17 24.5 L22.5 29.5 L17 34.5"
              stroke="#fff"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M25.5 34.5 L32 34.5" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" />
          </svg>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 700, color: INK, letterSpacing: -1 }}>
            SheetsLLM
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              display: "flex",
              fontSize: 76,
              fontWeight: 700,
              color: INK,
              letterSpacing: -3,
              lineHeight: 1.05,
            }}
          >
            Clean the same spreadsheet
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
            <div
              style={{
                display: "flex",
                fontSize: 76,
                fontWeight: 700,
                letterSpacing: -3,
                lineHeight: 1.05,
                color: VIOLET,
              }}
            >
              once. Never again.
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 30, color: MUTED, marginTop: 6 }}>
            Plain-English cleanups, saved as recipes. Your data never goes to the AI.
          </div>
        </div>

        {/* Footer: mini table motif */}
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          {[
            { w: 340, solid: true },
            { w: 240, solid: false },
            { w: 280, solid: false },
          ].map((bar, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                width: bar.w,
                height: 16,
                borderRadius: 8,
                background: bar.solid ? VIOLET : "#DDD6F8",
              }}
            />
          ))}
          <div style={{ display: "flex", fontSize: 24, color: MUTED, marginLeft: "auto" }}>
            sheets-llm.vercel.app
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
