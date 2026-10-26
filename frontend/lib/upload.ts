import { fetchWithAuth } from "@/lib/fetch-with-auth";

/* Sending a file to the backend.

   Straight to the backend, not through the /api/upload proxy: a Vercel
   function refuses a request body over 4.5 MB, which used to fail every
   larger upload with FUNCTION_PAYLOAD_TOO_LARGE. The proxy stays as the
   way for small files when the backend can't be reached directly (a
   preview deployment whose origin the backend does not allow). */

export const MAX_UPLOAD_BYTES = 400 * 1024 * 1024;
export const MAX_ROWS = 1_000_000;
/** A workbook is opened whole on the server, so it has its own, smaller cap
 *  (MAX_EXCEL_MB in backend/app/config.py, where the measurements are) */
export const MAX_EXCEL_BYTES = 10 * 1024 * 1024;

export const isWorkbook = (name: string) => /\.(xlsx|xls|xlsm)$/i.test(name);

/** What to say about a workbook over the Excel cap, or null when it fits. */
export function workbookTooLarge(file: { name: string; size: number }): string | null {
  if (!isWorkbook(file.name) || file.size <= MAX_EXCEL_BYTES) return null;
  return `${file.name} is ${megabytes(file.size)}. An Excel file can be up to ${MAX_EXCEL_BYTES / (1024 * 1024)} MB, because it has to be opened whole to read it. Save the sheet as CSV and upload that: a CSV can be up to ${megabytes(MAX_UPLOAD_BYTES)}.`;
}
/** The proxy's own ceiling, with room for the multipart wrapping */
const PROXY_MAX_BYTES = 4 * 1024 * 1024;

let target: Promise<string | null> | null = null;

function backendTarget(): Promise<string | null> {
  target ??= fetch("/api/upload/target")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d && typeof d.url === "string" && /^https?:\/\//.test(d.url) ? d.url.replace(/\/+$/, "") : null))
    .catch(() => null);
  return target;
}

/** POST a file to /upload with these query parameters. */
export async function sendFile(file: Blob, name: string, params: URLSearchParams): Promise<Response> {
  const qs = params.toString();
  const base = await backendTarget();
  if (base) {
    try {
      return await fetchWithAuth(`${base}/upload${qs ? `?${qs}` : ""}`, {
        method: "POST",
        body: file,
        headers: { "Content-Type": "application/octet-stream", "X-Filename": encodeURIComponent(name) },
      });
    } catch (e) {
      // Not reached at all (CORS on a preview, a network blip): the proxy
      // can still take a small file. A large one can't, so say so.
      if (file.size > PROXY_MAX_BYTES) throw e;
    }
  }
  const form = new FormData();
  form.append("file", file, name);
  return fetchWithAuth(`/api/upload${qs ? `?${qs}` : ""}`, { method: "POST", body: form });
}

/* ── Files over the row limit ───────────────────────────────────────── */

export type RowCheck = {
  /** More than MAX_ROWS data rows */
  over: boolean;
  /** The header and the first `max` rows, when over */
  head: Blob | null;
  /** Bytes in `head` */
  headBytes: number;
};

const isDelimited = (name: string) => /\.(csv|tsv|txt)$/i.test(name);

/** Whether a CSV has more than `max` data rows, reading only as far as it
 *  needs to know: a line break inside quotes is part of a value, not the
 *  end of a row. When it has more, `head` is the file cut cleanly after
 *  row `max`, ready to upload instead. */
export async function checkRows(file: File, max = MAX_ROWS): Promise<RowCheck> {
  if (!isDelimited(file.name)) return { over: false, head: null, headBytes: 0 };
  // Slices of 4 MB: only as much of the file as the check needs is read
  const SLICE = 4 * 1024 * 1024;
  let lines = 0;
  let inQuotes = false;
  for (let offset = 0; offset < file.size; offset += SLICE) {
    const value = new Uint8Array(await readSlice(file.slice(offset, offset + SLICE)));
    for (let i = 0; i < value.length; i++) {
      const b = value[i];
      if (b === 0x22) inQuotes = !inQuotes;
      else if (b === 0x0a && !inQuotes) {
        lines += 1;
        // The header plus `max` rows are complete: anything after is over
        if (lines === max + 1) {
          const cut = offset + i + 1;
          return cut < file.size
            ? { over: true, head: file.slice(0, cut, file.type || "text/csv"), headBytes: cut }
            : { over: false, head: null, headBytes: 0 };
        }
      }
    }
  }
  return { over: false, head: null, headBytes: 0 };
}

function readSlice(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/** "1.2 MB" */
export function megabytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
