"use client";
import { create } from "zustand";

export type SchemaCol = { name: string; dtype: string };
export type Schema = { columns: SchemaCol[]; samples: string[][] };

export type Status = "ready" | "processing" | "error";

interface AppState {
  activeFile: { id: string; name: string } | null;
  schema: Schema | null;
  preview: Record<string, unknown>[];
  columns: string[];
  explain: string;
  loading: boolean;
  error: string | null;
  historyAvailable: boolean;
  status: Status;
  uploads: { id: string; name: string; size?: number; uploadedAt?: string }[];
  // actions
  setActiveFile: (f: AppState["activeFile"]) => void;
  setSchema: (s: Schema | null) => void;
  setPreview: (rows: Record<string, unknown>[], cols: string[]) => void;
  setExplain: (t: string) => void;
  setLoading: (v: boolean) => void;
  setError: (msg: string | null) => void;
  setHistoryAvailable: (v: boolean) => void;
  setStatus: (s: Status) => void;
  addUpload: (u: { id: string; name: string; size?: number; uploadedAt?: string }) => void;
  clearWorkspace: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeFile: null,
  schema: null,
  preview: [],
  columns: [],
  explain: "",
  loading: false,
  error: null,
  historyAvailable: false,
  status: "ready",
  uploads: [],
  setActiveFile: (f) => set({ activeFile: f }),
  setSchema: (s) => set({ schema: s }),
  setPreview: (rows, cols) => set({ preview: rows, columns: cols }),
  setExplain: (t) => set({ explain: t }),
  setLoading: (v) => set({ loading: v }),
  setError: (msg) => set({ error: msg, status: msg ? "error" : "ready" }),
  setHistoryAvailable: (v) => set({ historyAvailable: v }),
  setStatus: (s) => set({ status: s }),
  addUpload: (u) => set((st) => ({ uploads: [u, ...st.uploads] })),
  clearWorkspace: () => set({ schema: null, preview: [], columns: [], explain: "", error: null })
}));
