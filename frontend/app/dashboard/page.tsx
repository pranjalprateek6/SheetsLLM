"use client";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import AuthGuard from "@/components/AuthGuard";
import EmptyState from "@/components/EmptyState";
import UsageCard from "@/components/UsageCard";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import {
  ArrowDown, ArrowUp, Copy, Download, FileSpreadsheet, Grid3X3, List, MoreHorizontal, Pencil, Search, Trash2,
} from "lucide-react";
import { UploadIcon, type UploadIconHandle } from "@/components/icons/upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

type FileItem = {
  id: string;
  name: string;
  row_count: number;
  column_count: number;
  size_bytes: number;
  original_format: string;
  created_at: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

type SortKey = "created_at" | "name" | "row_count";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 50;

export default function DashboardPage() {
  const router = useRouter();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("list");
  const [sortBy, setSortBy] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const uploadIconRef = useRef<UploadIconHandle>(null);
  const emptyUploadIconRef = useRef<UploadIconHandle>(null);
  const [renameValue, setRenameValue] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileItem | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Debounce the search input; reset to the first page when the query settles.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
        sort: sortBy,
        dir: sortDir,
      });
      if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
      const res = await fetchWithAuth(`/api/files?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFiles(data.files || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error("Failed to load files:", e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, sortDir, debouncedSearch]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const handleSort = (col: SortKey) => {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir(col === "name" ? "asc" : "desc");
    }
    setPage(1);
  };

  // Grid view sorts client-side on the current page using the same sort state.
  const gridFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") cmp = a.name.localeCompare(b.name);
      else if (sortBy === "row_count") cmp = a.row_count - b.row_count;
      else cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [files, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const handleOpen = (fileId: string) => router.push(`/workspace?file_id=${fileId}`);

  const handleDuplicate = async (fileId: string) => {
    setActionLoading(fileId);
    try {
      const r = await fetchWithAuth(`/api/files/${fileId}/duplicate`, { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      toast.success("File duplicated");
      fetchFiles();
    } catch (e) {
      console.error("Duplicate failed:", e);
      toast.error("Couldn't duplicate the file. Please try again.");
    } finally { setActionLoading(null); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const fileId = deleteTarget.id;
    const name = deleteTarget.name;
    setDeleteTarget(null);
    setActionLoading(fileId);
    try {
      const r = await fetchWithAuth(`/api/files/${fileId}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      setTotal((t) => Math.max(0, t - 1));
      if (files.length === 1 && page > 1) setPage(page - 1);
      toast.success(`Deleted "${name}"`);
    } catch (e) {
      console.error("Delete failed:", e);
      toast.error(`Couldn't delete "${name}". The file is untouched.`);
    } finally { setActionLoading(null); }
  };

  const handleRename = async (fileId: string) => {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    setActionLoading(fileId);
    try {
      const r = await fetchWithAuth(`/api/files/${fileId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: renameValue.trim() }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, name: renameValue.trim() } : f)));
      setRenamingId(null);
    } catch (e) {
      console.error("Rename failed:", e);
      toast.error("Couldn't rename the file. Please try again.");
    }
    finally { setActionLoading(null); }
  };

  const handleDownload = async (fileId: string, name: string, format: string) => {
    try {
      const res = await fetchWithAuth(`/api/download?file_id=${fileId}&format=${format}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name.replace(/\.[^/.]+$/, "") + `.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      console.error("Download failed:", e);
      toast.error("Download failed. Please try again.");
    }
  };

  const sortableHead = (label: string, col: SortKey, className?: string) => {
    const active = sortBy === col;
    return (
      <TableHead
        className={className}
        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
      >
        <button
          type="button"
          // Browsers set text-transform: none on form controls, so the heading's
          // uppercase does not reach a button nested inside it. min-h-6 keeps a
          // 10px label above the 24px target floor (2.5.8).
          className={`inline-flex min-h-6 items-center gap-1 uppercase tracking-[0.08em] transition-colors hover:text-foreground ${active ? "text-foreground" : ""}`}
          onClick={() => handleSort(col)}
        >
          {label}
          {active && (sortDir === "asc"
            ? <ArrowUp className="h-3 w-3" />
            : <ArrowDown className="h-3 w-3" />)}
        </button>
      </TableHead>
    );
  };

  const rowActions = (file: FileItem) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          disabled={actionLoading === file.id}
          onClick={(e) => e.stopPropagation()}
          aria-label={`File actions for ${file.name}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => { setRenamingId(file.id); setRenameValue(file.name); }}>
          <Pencil className="mr-2 h-4 w-4" /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleDuplicate(file.id)}>
          <Copy className="mr-2 h-4 w-4" /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Download className="mr-2 h-4 w-4" /> Download as…
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => handleDownload(file.id, file.name, "csv")}>
              CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDownload(file.id, file.name, "xlsx")}>
              Excel (.xlsx)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDownload(file.id, file.name, "json")}>
              JSON
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDownload(file.id, file.name, "tsv")}>
              TSV
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive-text focus:text-destructive-text"
          onClick={() => setDeleteTarget(file)}
        >
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const nameCell = (file: FileItem) =>
    renamingId === file.id ? (
      <Input
        autoFocus
        value={renameValue}
        onChange={(e) => setRenameValue(e.target.value)}
        onBlur={() => handleRename(file.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleRename(file.id);
          if (e.key === "Escape") setRenamingId(null);
        }}
        onClick={(e) => e.stopPropagation()}
        aria-label="File name" className="h-7 max-w-xs font-mono text-[13px]"
      />
    ) : (
      <Link
        href={`/workspace?file_id=${file.id}`}
        onClick={(e) => e.stopPropagation()}
        className="rounded-sm font-mono text-[13px] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {file.name}
      </Link>
    );

  return (
    <AuthGuard>
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Files</h1>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              <span className="tabular-nums">{total.toLocaleString()}</span> file{total !== 1 ? "s" : ""}
            </p>
          </div>
          <Button
            onClick={() => router.push("/workspace")}
            onMouseEnter={() => uploadIconRef.current?.startAnimation()}
            onMouseLeave={() => uploadIconRef.current?.stopAnimation()}
          >
            <UploadIcon ref={uploadIconRef} size={16} className="mr-2" /> Upload
          </Button>
        </div>

        <UsageCard />

        <div className="mb-4 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Search files" placeholder="Search files…"
            />
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setView(view === "grid" ? "list" : "grid")}
                  aria-label={view === "grid" ? "Switch to list view" : "Switch to grid view"}
                >
                  {view === "grid" ? <List className="h-4 w-4" /> : <Grid3X3 className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{view === "grid" ? "List view" : "Grid view"}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {loading && (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {!loading && loadError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 py-12 text-center">
            <p className="font-medium text-destructive-text">Couldn&apos;t load your files</p>
            <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
            <Button variant="outline" className="mt-4" onClick={fetchFiles}>
              Retry
            </Button>
          </div>
        )}

        {!loading && !loadError && files.length === 0 && (
          <div className="rounded-md border border-dashed py-8">
            {search ? (
              <EmptyState
                variant="search"
                title="No files match your search"
                description="Try a different search term."
              />
            ) : (
              <EmptyState
                variant="files"
                title="No files yet"
                description="Upload a spreadsheet, or start from a sample dataset, and describe your cleanup in plain English."
                action={
                  <Button
                    onClick={() => router.push("/workspace")}
                    onMouseEnter={() => emptyUploadIconRef.current?.startAnimation()}
                    onMouseLeave={() => emptyUploadIconRef.current?.stopAnimation()}
                  >
                    <UploadIcon ref={emptyUploadIconRef} size={16} className="mr-2" /> Upload your first file
                  </Button>
                }
              />
            )}
          </div>
        )}

        {!loading && !loadError && files.length > 0 && view === "list" && (
          <div className="overflow-hidden rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  {sortableHead("Name", "name")}
                  <TableHead className="hidden w-24 text-right sm:table-cell">Size</TableHead>
                  {sortableHead("Rows", "row_count", "hidden w-24 text-right sm:table-cell")}
                  <TableHead className="hidden w-20 text-right sm:table-cell">Cols</TableHead>
                  {sortableHead("Created", "created_at", "hidden w-32 sm:table-cell")}
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => (
                  <TableRow
                    key={file.id}
                    className="cursor-pointer"
                    onClick={() => handleOpen(file.id)}
                  >
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <FileSpreadsheet className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        {nameCell(file)}
                        {/* The format is a property of the file, not a status, so
                            it wears the grid's type-mark treatment, not a pill. */}
                        <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                          {file.original_format}
                        </span>
                      </div>
                      {/* The columns those numbers live in are hidden below sm,
                          so the row carries them itself. */}
                      <p className="mt-1 pl-[26px] font-mono text-[11px] tabular-nums text-muted-foreground sm:hidden">
                        {file.row_count.toLocaleString()} × {file.column_count.toLocaleString()} · {formatBytes(file.size_bytes)} · {formatDate(file.created_at)}
                      </p>
                    </TableCell>
                    <TableCell className="hidden text-right font-mono text-xs tabular-nums text-muted-foreground sm:table-cell">
                      {formatBytes(file.size_bytes)}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono text-xs tabular-nums text-muted-foreground sm:table-cell">
                      {file.row_count.toLocaleString()}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono text-xs tabular-nums text-muted-foreground sm:table-cell">
                      {file.column_count.toLocaleString()}
                    </TableCell>
                    <TableCell className="hidden text-xs tabular-nums text-muted-foreground sm:table-cell">
                      {formatDate(file.created_at)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>{rowActions(file)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!loading && !loadError && files.length > 0 && view === "grid" && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {gridFiles.map((file) => (
              <div
                key={file.id}
                className="group cursor-pointer rounded-md border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
                onClick={() => handleOpen(file.id)}
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded border bg-muted/60">
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      {file.original_format}
                    </span>
                    {rowActions(file)}
                  </div>
                </div>
                <div className="mb-1.5 truncate text-sm">{nameCell(file)}</div>
                <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {file.row_count.toLocaleString()} × {file.column_count.toLocaleString()} · {formatBytes(file.size_bytes)}
                </p>
                <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{formatDate(file.created_at)}</p>
              </div>
            ))}
          </div>
        )}

        {!loading && !loadError && total > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm tabular-nums text-muted-foreground">
              {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of {total.toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes the file and its full transformation history. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AuthGuard>
  );
}
