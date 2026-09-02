// Shared client-side CSV helpers for the free /tools pages.
// Everything here runs in the browser — files never leave the machine.
import Papa from "papaparse";

export type Table = {
  headers: string[];
  rows: string[][];
  /** Non-fatal problems worth telling the user about before they download. */
  warnings: string[];
};

/** Excel writes a UTF-8 BOM; papaparse only strips it for string input or
 *  when `header: true`, neither of which applies here, so it would survive
 *  into the first column name. */
function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

export function parseCsvFile(file: File): Promise<Table> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: "greedy",
      complete: (result) => {
        const data = result.data as string[][];
        if (!data.length) {
          reject(new Error("The file appears to be empty. Check that it has at least a header row."));
          return;
        }

        const warnings: string[] = [];

        // papaparse reports malformed CSV through result.errors, never through
        // the error callback, so ignoring it meant an unterminated quote or an
        // undetectable delimiter parsed into garbage and reported success.
        const errs = result.errors ?? [];
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

        // Papa.unparse({fields, data}) drops any cell past fields.length, so a
        // row wider than the header used to lose columns silently on write.
        const widest = rows.reduce((m, r) => Math.max(m, r.length), headers.length);
        if (widest > headers.length) {
          const added = widest - headers.length;
          for (let i = headers.length; i < widest; i++) headers.push(`Column ${i + 1}`);
          warnings.push(
            `${added} column${added === 1 ? "" : "s"} had no header, so ${added === 1 ? "it was" : "they were"} named Column ${headers.length - added + 1}${added === 1 ? "" : `-${headers.length}`}. Nothing was dropped.`
          );
        }

        resolve({ headers, rows, warnings });
      },
      error: (err) => reject(new Error(err.message || "Could not read the file. Try re-saving it as CSV.")),
    });
  });
}

export function toCsv(table: Pick<Table, "headers" | "rows">): string {
  return Papa.unparse({ fields: table.headers, data: table.rows });
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
