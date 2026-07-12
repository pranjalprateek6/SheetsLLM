"use client";
import { useEffect, useState } from "react";

/** Platform modifier-key label for shortcut hints: "⌘" on macOS, "Ctrl"
    everywhere else. Defaults to "Ctrl" before mount so SSR markup and the
    first client paint always match. */
export function useModKey(): "Ctrl" | "⌘" {
  const [modKey, setModKey] = useState<"Ctrl" | "⌘">("Ctrl");

  useEffect(() => {
    const platform = navigator.platform || navigator.userAgent;
    if (/mac/i.test(platform)) setModKey("⌘");
  }, []);

  return modKey;
}
