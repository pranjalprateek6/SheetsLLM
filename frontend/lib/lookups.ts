import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { sendFile } from "@/lib/upload";

/** A lookup table linked to the open file: another file of yours, under a
 *  short name a step or a question can use. */
export type Lookup = {
  alias: string;
  file_id: string;
  name: string;
  columns: { name: string; dtype: string }[];
};

export async function listLookups(fileId: string): Promise<Lookup[]> {
  const r = await fetchWithAuth(`/api/files/${encodeURIComponent(fileId)}/lookups`);
  if (!r.ok) return [];
  const d = await r.json().catch(() => ({}));
  return Array.isArray(d?.lookups) ? d.lookups : [];
}

export class LookupFailure extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export async function addLookup(fileId: string, lookupFileId: string, alias?: string): Promise<Lookup> {
  const r = await fetchWithAuth(`/api/files/${encodeURIComponent(fileId)}/lookups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lookup_file_id: lookupFileId, ...(alias ? { alias } : {}) }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new LookupFailure(d.code ?? "LOOKUP_FAILED", d.message ?? "Couldn't link that file.");
  return d as Lookup;
}

/** Upload `file` as its own file, then link it to `fileId` under `alias`.
 *  Used when a sample opens with its lookup beside it. The upload counts
 *  as one of the month's uploads, like any file. */
export async function uploadAndLink(fileId: string, file: File, alias: string): Promise<Lookup> {
  const r = await sendFile(file, file.name, new URLSearchParams({ source: "sample" }));
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.file_id) throw new LookupFailure(d.code ?? "UPLOAD_FAILED", d.message ?? `Couldn't upload ${file.name}.`);
  try {
    return await addLookup(fileId, d.file_id, alias);
  } catch (e) {
    // Not linked, so not wanted: a lookup that failed to link would otherwise
    // sit in the file list as a stray upload.
    await fetchWithAuth(`/api/files/${encodeURIComponent(d.file_id)}`, { method: "DELETE" }).catch(() => {});
    throw e;
  }
}

export async function removeLookup(fileId: string, alias: string): Promise<boolean> {
  const r = await fetchWithAuth(`/api/files/${encodeURIComponent(fileId)}/lookups/${encodeURIComponent(alias)}`, { method: "DELETE" });
  return r.ok;
}

/** orders_oct.csv becomes orders_oct: what the server would pick too. */
export function suggestAlias(fileName: string, taken: string[] = []): string {
  let stem = fileName.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 28) || "lookup";
  if (!/^[a-z]/.test(stem)) stem = `t_${stem}`;
  let alias = stem;
  let n = 2;
  while (taken.includes(alias)) alias = `${stem}_${n++}`;
  return alias;
}
