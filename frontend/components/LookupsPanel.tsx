"use client";
import { useEffect, useState } from "react";
import { FileSpreadsheet, Link2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { addLookup, LookupFailure, removeLookup, suggestAlias, type Lookup } from "@/lib/lookups";

/* The other tables beside the open file. Link one of your files under a
   short name, and from then on the column menu can bring its columns in
   on a key, and Chef can join it. Names and types are all Chef sees of it. */

type FileRow = { id: string; name: string; row_count?: number };

export default function LookupsPanel({
  open,
  onClose,
  fileId,
  lookups,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  fileId?: string;
  lookups: Lookup[];
  /** The list after a link or an unlink */
  onChange: (next: Lookup[]) => void;
}) {
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [pick, setPick] = useState<FileRow | null>(null);
  const [alias, setAlias] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !picking || files) return;
    fetchWithAuth("/api/files?page_size=50")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFiles((d?.files ?? []).filter((f: FileRow) => f.id !== fileId)))
      .catch(() => setFiles([]));
  }, [open, picking, files, fileId]);

  const choose = (f: FileRow) => {
    setPick(f);
    setAlias(suggestAlias(f.name, lookups.map((l) => l.alias)));
    setError(null);
  };

  const link = async () => {
    if (!fileId || !pick || busy) return;
    setBusy(true);
    setError(null);
    try {
      const added = await addLookup(fileId, pick.id, alias.trim());
      onChange([...lookups.filter((l) => l.alias !== added.alias), added]);
      setPick(null);
      setPicking(false);
      toast.success(`${added.alias} is linked. Its columns are one click away in any column menu, and Chef can join it.`);
    } catch (e) {
      setError(e instanceof LookupFailure ? e.message : "Couldn't link that file. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (l: Lookup) => {
    if (!fileId || busy) return;
    setBusy(true);
    try {
      if (await removeLookup(fileId, l.alias)) onChange(lookups.filter((x) => x.alias !== l.alias));
      else toast.error("Couldn't unlink that table.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>Lookup tables</SheetTitle>
          <SheetDescription>
            Other files of yours this file can use: bring their columns in on a key, or let Chef join them. Chef sees
            their column names and types, never a value.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {lookups.length === 0 && !picking && (
            <p className="text-[13px] text-muted-foreground">
              Nothing linked yet. A lookup is a file like a list of regions and their managers, or products and their
              prices.
            </p>
          )}
          {lookups.length > 0 && (
            <ul className="divide-y">
              {lookups.map((l) => (
                <li key={l.alias} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">
                      <span className="font-mono text-[12px]">{l.alias}</span>
                      <span className="text-muted-foreground"> · {l.name}</span>
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                      {l.columns.map((c) => c.name).join(", ") || "no columns"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => unlink(l)}
                    disabled={busy}
                    aria-label={`Unlink ${l.alias}`}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!picking ? (
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setPicking(true)} disabled={!fileId || lookups.length >= 5}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Link a file
            </Button>
          ) : (
            <div className="mt-4 border-t pt-4">
              {!pick ? (
                <>
                  <p className="text-[12px] font-medium text-muted-foreground">Pick one of your files</p>
                  <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">
                    {files === null && <Skeleton className="h-9 w-full" />}
                    {files?.length === 0 && <p className="text-[13px] text-muted-foreground">No other files yet. Upload the lookup first.</p>}
                    {files?.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => choose(f)}
                        className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-[13px] transition-colors hover:border-input hover:bg-accent/40"
                      >
                        <FileSpreadsheet className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{f.name}</span>
                        <span className="flex-shrink-0 text-[12px] tabular-nums text-muted-foreground">{(f.row_count ?? 0).toLocaleString()} rows</span>
                      </button>
                    ))}
                  </div>
                  <Button variant="ghost" size="sm" className="mt-2" onClick={() => setPicking(false)}>Cancel</Button>
                </>
              ) : (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void link();
                  }}
                >
                  <p className="text-[13px]">
                    <Link2 className="mr-1.5 inline h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    {pick.name}
                  </p>
                  <label htmlFor="lookup-alias" className="block text-[12px] text-muted-foreground">
                    Name to use it by. Letters, digits and underscores.
                  </label>
                  <Input id="lookup-alias" value={alias} onChange={(e) => setAlias(e.target.value)} className="h-8 font-mono text-[13px]" maxLength={30} />
                  {error && (
                    <p role="alert" className="text-[12px] text-destructive-text">{error}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <Button type="submit" size="sm" disabled={busy || !alias.trim()}>
                      {busy ? "Linking…" : "Link"}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setPick(null)} disabled={busy}>
                      Back
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
