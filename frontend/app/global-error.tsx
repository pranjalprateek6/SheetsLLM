"use client";

import { useEffect } from "react";

// Catches errors in the root layout itself, where app/error.tsx cannot help.
// It replaces the whole document, so it brings its own html, body and styles
// and depends on nothing that might be what failed.
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Root error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#08090a",
          color: "#f7f8f8",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          padding: 16,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Something went wrong</h1>
          <p style={{ marginTop: 8, fontSize: 14, color: "#8a8f98" }}>
            SheetsLLM hit an unexpected error. Your files and data are safe.
          </p>
          <div style={{ marginTop: 20, display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{ height: 32, padding: "0 14px", borderRadius: 999, border: "1px solid #2a2c31", background: "transparent", color: "inherit", cursor: "pointer" }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{ height: 32, padding: "0 14px", borderRadius: 999, background: "#f7f8f8", color: "#08090a", display: "inline-flex", alignItems: "center", textDecoration: "none", fontSize: 14 }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
