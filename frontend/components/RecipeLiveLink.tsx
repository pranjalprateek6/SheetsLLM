"use client";
import { useEffect, useState } from "react";
import { Copy, Radio } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { fetchWithAuth } from "@/lib/fetch-with-auth";

/* A recipe's live link: one address that always serves the latest file the
   recipe cleaned, as CSV. Pasted into a Google Sheet as =IMPORTDATA, or
   into Excel's Data > From Web, the sheet keeps up with every run, the
   scheduled ones included. Anyone with the link can read the file, so it
   can be turned off, and a new link ends the old one. */

async function call(recipeId: string, method: "GET" | "POST" | "DELETE"): Promise<string | null> {
  const r = await fetchWithAuth(`/api/recipes/${recipeId}/live-link`, { method });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || "That didn't work. Try again.");
  return d.url ?? null;
}

export default function RecipeLiveLink({ recipeId }: { recipeId: string }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    call(recipeId, "GET").then((u) => alive && setUrl(u)).catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [recipeId]);

  const act = async (method: "POST" | "DELETE") => {
    setBusy(true);
    try {
      setUrl(await call(recipeId, method));
      if (method === "POST") toast.success("Live link ready. Paste it into a sheet once; it keeps up with every run.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string, what: string) => {
    void navigator.clipboard?.writeText(text).then(() => toast.success(`${what} copied`));
  };

  if (url === undefined) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (!url) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex min-w-0 items-start gap-2 text-sm">
          <Radio className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">
            Keep a Google Sheet or Excel workbook up to date: a link that always serves the latest file this recipe cleaned.
          </span>
        </p>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void act("POST")}>
          {busy ? "Making…" : "Make a live link"}
        </Button>
      </div>
    );
  }

  const formula = `=IMPORTDATA("${url}")`;
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Radio className="h-4 w-4 text-success-text" aria-hidden /> Live link
      </p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border bg-background px-2 py-1.5 font-mono text-[12px]">{url}</code>
        <Button size="sm" variant="outline" onClick={() => copy(url, "Link")}>
          <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
        </Button>
      </div>
      <ul className="space-y-1 text-[13px] text-muted-foreground">
        <li>
          Google Sheets: put{" "}
          <button type="button" onClick={() => copy(formula, "Formula")} className="font-mono text-[12px] text-foreground underline decoration-dotted underline-offset-2 hover:text-primary-accent">
            =IMPORTDATA(&hellip;)
          </button>{" "}
          in a cell. It refreshes about every hour.
        </li>
        <li>Excel: Data, From Web, paste the link. Refresh All picks up a new run.</li>
        <li>Anyone with the link can read the cleaned file.</li>
      </ul>
      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act("POST")}>
          New link
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act("DELETE")}>
          Turn off
        </Button>
      </div>
    </div>
  );
}
