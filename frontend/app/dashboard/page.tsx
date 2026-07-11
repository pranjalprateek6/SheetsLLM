"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import UsageCard from "@/components/UsageCard";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import {
  FileSpreadsheet, Search, Grid3X3, List, Upload, Copy, Trash2, Pencil, Download, ArrowUpDown,
} from "lucide-react";
import { TextShimmer } from "@/components/ui/text-shimmer";

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
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function DashboardPage() {
  const router = useRouter();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState<"created_at" | "name" | "row_count">("created_at");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/files?page=1&page_size=50");
      const data = await res.json();
      setFiles(data.files || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error("Failed to load files:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const filtered = files
    .filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "row_count") return b.row_count - a.row_count;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const handleOpen = (fileId: string) => router.push(`/workspace?file_id=${fileId}`);

  const handleDuplicate = async (fileId: string) => {
    setActionLoading(fileId);
    try { await fetchWithAuth(`/api/files/${fileId}/duplicate`, { method: "POST" }); fetchFiles(); }
    catch (e) { console.error("Duplicate failed:", e); }
    finally { setActionLoading(null); }
  };

  const handleDelete = async (fileId: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setActionLoading(fileId);
    try { await fetchWithAuth(`/api/files/${fileId}`, { method: "DELETE" }); setFiles((prev) => prev.filter((f) => f.id !== fileId)); }
    catch (e) { console.error("Delete failed:", e); }
    finally { setActionLoading(null); }
  };

  const handleRename = async (fileId: string) => {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    setActionLoading(fileId);
    try {
      await fetchWithAuth(`/api/files/${fileId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: renameValue.trim() }) });
      setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, name: renameValue.trim() } : f)));
      setRenamingId(null);
    } catch (e) { console.error("Rename failed:", e); }
    finally { setActionLoading(null); }
  };

  const handleDownload = async (fileId: string, name: string) => {
    try {
      const res = await fetchWithAuth(`/api/download?file_id=${fileId}&format=csv`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name.replace(/\.[^/.]+$/, "") + ".csv";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) { console.error("Download failed:", e); }
  };

  return (
    <AuthGuard>
    <div className="max-w-6xl mx-auto pt-8 px-4 pb-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-mono font-bold text-white tracking-wider">YOUR FILES</h1>
          <p className="text-sm font-mono text-white/40 mt-1">{total} file{total !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={() => router.push("/workspace")} className="px-5 py-2.5 btn-accent inline-flex items-center gap-2 text-sm">
          <Upload className="h-4 w-4" /> UPLOAD NEW
        </button>
      </div>

      <UsageCard />

      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-white/[0.03] border border-white/10 outline-none focus:ring-1 focus:ring-cyan-500/40 text-white placeholder:text-white/20 transition-shadow font-mono text-sm" placeholder="Search files..." />
        </div>
        <button onClick={() => setSortBy(sortBy === "created_at" ? "name" : sortBy === "name" ? "row_count" : "created_at")} className="p-2.5 border border-white/10 hover:bg-white/5 transition-colors" title={`Sort by: ${sortBy === "created_at" ? "Date" : sortBy === "name" ? "Name" : "Rows"}`}>
          <ArrowUpDown className="h-4 w-4 text-white" />
        </button>
        <button onClick={() => setView(view === "grid" ? "list" : "grid")} className="p-2.5 border border-white/10 hover:bg-white/5 transition-colors">
          {view === "grid" ? <List className="h-4 w-4 text-white" /> : <Grid3X3 className="h-4 w-4 text-white" />}
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <TextShimmer className="font-mono text-sm" duration={1.2}>Loading files...</TextShimmer>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-16">
          <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-white/10" />
          <p className="text-white/40 font-mono">{search ? "No files match your search" : "No files yet. Upload one to get started!"}</p>
        </div>
      )}

      {!loading && view === "grid" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((file) => (
            <div key={file.id} className="bg-neutral-900 border border-white/10 p-5 cursor-pointer group hover:border-white/20 transition-colors" onClick={() => handleOpen(file.id)}>
              <div className="flex items-start justify-between mb-3">
                <FileSpreadsheet className="h-5 w-5 text-white/40" />
                <span className="text-xs px-2 py-0.5 bg-white/5 text-white/40 uppercase font-mono">{file.original_format}</span>
              </div>
              {renamingId === file.id ? (
                <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onBlur={() => handleRename(file.id)} onKeyDown={(e) => { if (e.key === "Enter") handleRename(file.id); if (e.key === "Escape") setRenamingId(null); }} onClick={(e) => e.stopPropagation()} className="w-full text-sm font-mono font-medium text-white bg-transparent border-b border-white/20 outline-none mb-2" />
              ) : (
                <h3 className="font-mono font-medium text-white text-sm truncate mb-2">{file.name}</h3>
              )}
              <div className="text-xs font-mono text-white/30 space-y-1">
                <p>{file.row_count.toLocaleString()} rows x {file.column_count.toLocaleString()} cols</p>
                <p>{formatBytes(file.size_bytes)}</p>
                <p>{formatDate(file.created_at)}</p>
              </div>
              <div className="flex gap-1 mt-3 pt-3 border-t border-white/5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => { setRenamingId(file.id); setRenameValue(file.name); }} className="p-1.5 hover:bg-white/5 transition-colors" title="Rename"><Pencil className="h-3.5 w-3.5 text-white/40" /></button>
                <button onClick={() => handleDuplicate(file.id)} className="p-1.5 hover:bg-white/5 transition-colors" title="Duplicate" disabled={actionLoading === file.id}><Copy className="h-3.5 w-3.5 text-white/40" /></button>
                <button onClick={() => handleDownload(file.id, file.name)} className="p-1.5 hover:bg-white/5 transition-colors" title="Download"><Download className="h-3.5 w-3.5 text-white/40" /></button>
                <button onClick={() => handleDelete(file.id, file.name)} className="p-1.5 hover:bg-red-900/20 transition-colors ml-auto" title="Delete" disabled={actionLoading === file.id}><Trash2 className="h-3.5 w-3.5 text-red-500" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && view === "list" && (
        <div className="bg-neutral-900 border border-white/10 overflow-hidden">
          <table className="w-full text-sm font-mono">
            <thead className="bg-white/[0.02]">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-white text-xs tracking-wider">NAME</th>
                <th className="px-4 py-3 text-left font-semibold text-white text-xs tracking-wider">SIZE</th>
                <th className="px-4 py-3 text-left font-semibold text-white text-xs tracking-wider">ROWS</th>
                <th className="px-4 py-3 text-left font-semibold text-white text-xs tracking-wider">CREATED</th>
                <th className="px-4 py-3 text-right font-semibold text-white text-xs tracking-wider">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((file) => (
                <tr key={file.id} className="border-t border-white/5 hover:bg-white/[0.02] cursor-pointer transition-colors" onClick={() => handleOpen(file.id)}>
                  <td className="px-4 py-3 text-white font-medium">{file.name}</td>
                  <td className="px-4 py-3 text-white/40">{formatBytes(file.size_bytes)}</td>
                  <td className="px-4 py-3 text-white/40">{file.row_count.toLocaleString()}</td>
                  <td className="px-4 py-3 text-white/40">{formatDate(file.created_at)}</td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <button onClick={() => handleDuplicate(file.id)} className="p-1.5 hover:bg-white/5 transition-colors" title="Duplicate"><Copy className="h-3.5 w-3.5" /></button>
                      <button onClick={() => handleDownload(file.id, file.name)} className="p-1.5 hover:bg-white/5 transition-colors" title="Download"><Download className="h-3.5 w-3.5" /></button>
                      <button onClick={() => handleDelete(file.id, file.name)} className="p-1.5 hover:bg-red-900/20 transition-colors" title="Delete"><Trash2 className="h-3.5 w-3.5 text-red-500" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </AuthGuard>
  );
}
