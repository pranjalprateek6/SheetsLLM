// Shared client-side CSV helpers for the free /tools pages.
// Everything here runs in the browser — files never leave the machine.
//
// Which also means every byte of work happens on the one thread that paints the
// page. A 300 MB export parsed and rewritten in a single synchronous pass locks
// the tab for long enough that Chrome offers to kill it, so both the read and
// the transforms below run in slices with the frame handed back in between.
import Papa from "papaparse";

export type Table = {
  headers: string[];
  rows: string[][];
  /** Non-fatal problems worth telling the user about before they download. */
  warnings: string[];
};

/** Reports how far along a long job is, 0 to 1. */
export type Progress = (fraction: number) => void;

/** How much of the file papaparse reads per turn of the event loop. Its 10 MB
 *  default parses each chunk in one synchronous burst; 512 KB keeps a burst
 *  short enough that a progress bar can actually move during the read. */
const READ_CHUNK_BYTES = 512 * 1024;

/** Rows per slice in the transform loops — large enough that the per-slice
 *  overhead is noise, small enough to fit inside a frame. */
const ROW_SLICE = 10_000;

/** Files above this are not refused, only warned about first: the parsed table,
 *  the transformed copy and the CSV string all live in the tab's memory at
 *  once, so a file this size can exhaust it on a modest machine. */
export const LARGE_FILE_BYTES = 50 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

/** Hands the frame back to the browser so it can paint before the next slice.
 *
 *  Not setTimeout: browsers clamp timers to roughly one second in a background
 *  tab, so switching away mid-job would stretch a 20-slice pass into 20 seconds.
 *  A MessageChannel post is a task the browser does not throttle, and it still
 *  yields the thread. This is the same primitive React's scheduler uses. */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

/** Walks `total` items in slices, yielding between each. `work` is handed a
 *  half-open [start, end) range and does whatever it likes with it. */
export async function inSlices(
  total: number,
  work: (start: number, end: number) => void,
  onProgress?: Progress
): Promise<void> {
  if (total === 0) {
    onProgress?.(1);
    return;
  }
  for (let start = 0; start < total; start += ROW_SLICE) {
    const end = Math.min(start + ROW_SLICE, total);
    work(start, end);
    onProgress?.(end / total);
    if (end < total) await yieldToBrowser();
  }
}

/** Excel writes a UTF-8 BOM; papaparse only strips it for string input or
 *  when `header: true`, neither of which applies here, so it would survive
 *  into the first column name. */
function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function assembleTable(data: string[][], errs: Papa.ParseError[]): Table {
  if (!data.length) {
    throw new Error("The file appears to be empty. Check that it has at least a header row.");
  }

  const warnings: string[] = [];

  // papaparse reports malformed CSV through result.errors, never through the
  // error callback, so ignoring it meant an unterminated quote or an
  // undetectable delimiter parsed into garbage and reported success.
  if (errs.length) {
    const first = errs[0];
    const where = typeof first.row === "number" ? `Row ${first.row + 1}: ` : "";
    warnings.push(
      `${where}${first.message || "this file does not follow the CSV format"}.` +
        (errs.length > 1 ? ` ${errs.length - 1} more issue${errs.length === 2 ? "" : "s"} like this.` : "")
    );
  }

  const headers = (data[0] ?? []).map((h, i) => (i === 0 ? stripBom(h) : h));
  const rows = data.slice(1);

  // Papa.unparse({fields, data}) drops any cell past fields.length, so a row
  // wider than the header used to lose columns silently on write.
  const widest = rows.reduce((m, r) => Math.max(m, r.length), headers.length);
  if (widest > headers.length) {
    const added = widest - headers.length;
    for (let i = headers.length; i < widest; i++) headers.push(`Column ${i + 1}`);
    warnings.push(
      `${added} column${added === 1 ? "" : "s"} had no header, so ${added === 1 ? "it was" : "they were"} named Column ${headers.length - added + 1}${added === 1 ? "" : `-${headers.length}`}. Nothing was dropped.`
    );
  }

  return { headers, rows, warnings };
}

export function parseCsvFile(file: File, onProgress?: Progress): Promise<Table> {
  return new Promise((resolve, reject) => {
    const data: string[][] = [];
    const errors: Papa.ParseError[] = [];
    let settled = false;

    Papa.parse<string[]>(file, {
      skipEmptyLines: "greedy",
      chunkSize: READ_CHUNK_BYTES,
      chunk: (result) => {
        // A fresh parser runs per chunk, so error row numbers restart at zero
        // each time. Rebase them onto the file before they reach the user.
        const offset = data.length;
        for (const e of result.errors) {
          errors.push(typeof e.row === "number" ? { ...e, row: e.row + offset } : e);
        }
        for (const row of result.data as string[][]) data.push(row);
        // cursor counts characters and file.size counts bytes, so on a
        // multi-byte file this runs slightly ahead; complete() pins it to 1.
        if (file.size) onProgress?.(Math.min(1, result.meta.cursor / file.size));
      },
      // With a chunk handler papaparse stops accumulating, so complete() is
      // called with nothing — the rows gathered above are the whole file.
      complete: () => {
        if (settled) return;
        settled = true;
        onProgress?.(1);
        try {
          resolve(assembleTable(data, errors));
        } catch (e) {
          reject(e);
        }
      },
      error: (err) => {
        if (settled) return;
        settled = true;
        reject(new Error(err.message || "Could not read the file. Try re-saving it as CSV."));
      },
    });
  });
}

/** Serialises in slices so a large table does not block the frame. */
export async function toCsvAsync(
  table: Pick<Table, "headers" | "rows">,
  onProgress?: Progress
): Promise<string> {
  const width = table.headers.length;
  const parts = [Papa.unparse({ fields: table.headers, data: [] })];

  await inSlices(
    table.rows.length,
    (start, end) => {
      const slice = table.rows.slice(start, end).map((r) =>
        // Papa.unparse(rows) writes every cell it is handed, so pad and clip to
        // the header width the way the {fields, data} form would have.
        r.length === width ? r : Array.from({ length: width }, (_, i) => r[i] ?? "")
      );
      parts.push(Papa.unparse(slice));
    },
    onProgress
  );

  return parts.filter((p) => p !== "").join("\r\n");
}

export function downloadText(filename: string, text: string, mime = "text/csv") {
  // Excel on Windows reads a BOM-less CSV in the system code page and mojibakes
  // anything non-Latin; the MIME charset is not stored in the file.
  const body = mime.startsWith("text/csv") ? "\ufeff" + text : text;
  const blob = new Blob([body], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  // Revoking on the same tick aborts the download in Firefox and some Safari
  // versions, so hand the browser a frame to start it first.
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

export function baseName(filename: string): string {
  return filename.replace(/\.[^/.]+$/, "");
}

export function formatCount(n: number): string {
  return n.toLocaleString();
}

/** "1 row" / "2 rows" — avoids sentences assembled around a bare variable. */
export function plural(n: number, one: string, many = one + "s"): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}
