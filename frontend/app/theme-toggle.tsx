"use client";
import { useTheme } from "next-themes";

export default function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const isDark = (theme ?? resolvedTheme) === "dark";
  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="btn"
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      {isDark ? "🌙" : "☀️"}&nbsp;{isDark ? "Dark" : "Light"}
    </button>
  );
}

