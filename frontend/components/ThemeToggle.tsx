"use client";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="w-16 h-8" />;

  const isDark = (resolvedTheme || theme) === "dark";

  return (
    <div className="inline-flex items-center rounded-full bg-black/5 dark:bg-white/5 p-0.5">
      <button
        aria-label="Light mode"
        onClick={() => setTheme("light")}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
          !isDark ? "bg-white dark:bg-neutral-700 shadow-sm text-cyan-600" : "text-black/30 dark:text-white/30 hover:text-black/60 dark:hover:text-white/60"
        }`}
      >
        <Sun className="h-3.5 w-3.5" />
      </button>
      <button
        aria-label="Dark mode"
        onClick={() => setTheme("dark")}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
          isDark ? "bg-neutral-700 shadow-sm text-cyan-400" : "text-black/30 dark:text-white/30 hover:text-black/60 dark:hover:text-white/60"
        }`}
      >
        <Moon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
