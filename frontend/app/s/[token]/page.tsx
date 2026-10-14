"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, FileSpreadsheet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchSharedInfo, LoopFailure, type SharedFileInfo } from "@/lib/loops";

/* A shared cleaned file: what it is, how it was cleaned, the download, and
   the way to clean your own. The raw CSV stays at /api/shared/<token> for
   IMPORTDATA and scripts. */

export default function SharedFilePage({ params }: { params: { token: string } }) {
  const [info, setInfo] = useState<SharedFileInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    fetchSharedInfo(params.token)
      .then(setInfo)
      .catch((e) => setError(e instanceof LoopFailure ? e.message : "This link has expired or never existed."));
  }, [params.token]);

  const csvHref = `/api/shared/${encodeURIComponent(params.token)}`;
  const until = info ? new Date(info.expires_at * 1000).toLocaleDateString(undefined, { day: "numeric", month: "long" }) : "";

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
      {error ? (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">This link doesn&apos;t work any more</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            {error} Shared files stay available for seven days; ask whoever sent it for a new link.
          </p>
          <Button asChild className="mt-6">
            <Link href="/">See what SheetsLLM does</Link>
          </Button>
        </div>
      ) : !info ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <>
          <p className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
            <FileSpreadsheet className="h-4 w-4 text-primary-accent" aria-hidden /> A shared file
          </p>
          <h1 className="mt-2 break-all text-2xl font-semibold tracking-tight">{info.name}</h1>
          <p className="mt-2 text-[15px] tabular-nums text-muted-foreground">
            {info.rows?.toLocaleString()} rows × {info.columns?.toLocaleString()} columns
            {info.steps.length > 0 ? `, cleaned in ${info.steps.length} step${info.steps.length === 1 ? "" : "s"} with SheetsLLM` : ""}.
            Available until {until}.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button asChild>
              <a href={csvHref} download>
                <Download className="mr-1.5 h-4 w-4" /> Download the CSV
              </a>
            </Button>
          </div>

          {info.steps.length > 0 && (
            <div className="mt-8">
              <h2 className="text-[13px] font-medium">How it was cleaned</h2>
              <ol className="mt-2 divide-y rounded-xl border bg-card">
                {info.steps.map((s, i) => (
                  <li key={i} className="flex items-start gap-3 px-4 py-2.5 text-[14px]">
                    <span className="mt-0.5 font-mono text-[12px] tabular-nums text-muted-foreground">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="mt-10 rounded-xl border border-primary/25 bg-primary/[0.05] px-5 py-4">
            <p className="text-[15px] font-medium">Clean your own exports the same way</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Fix a file once, save the steps as a recipe, and next month&apos;s export is one click with no AI call.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/auth?mode=signup&from=share-page">Start free</Link>
            </Button>
          </div>

          <p className="mt-8 text-[12px] text-muted-foreground">
            In Google Sheets: <span className="font-mono">=IMPORTDATA(&quot;{origin}{csvHref}&quot;)</span>
          </p>
        </>
      )}
    </main>
  );
}
