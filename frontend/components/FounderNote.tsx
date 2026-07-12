"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

/* A short personal note on the first visit — products that feel made
   with intention convert and retain better than anonymous ones. One
   dismissal, remembered forever. */

const DISMISSED_KEY = "sllm_founder_note_dismissed";

export default function FounderNote() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(localStorage.getItem(DISMISSED_KEY) !== "true");
    } catch {}
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, "true");
    } catch {}
    setVisible(false);
  };

  return (
    <div className="relative rounded-2xl border bg-card p-5 shadow-xs">
      <button
        onClick={dismiss}
        className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Dismiss note"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Every month, the same messy export — and the same 40 minutes fixing
        it by hand. I built SheetsLLM so you describe that cleanup once,
        save it as a recipe, and never do it manually again. If anything
        feels off, the Feedback button up top reaches me directly.
      </p>
      <p className="mt-3 text-sm font-medium">— Pranjal, founder</p>
    </div>
  );
}
