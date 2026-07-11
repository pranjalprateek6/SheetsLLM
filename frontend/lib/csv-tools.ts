// Shared client-side CSV helpers for the free /tools pages.
// Everything here runs in the browser — files never leave the machine.
import Papa from "papaparse";

export type Table = {
  headers: string[];
  rows: string[][];
};

export function parseCsvFile(file: File): Promise<Table> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: "greedy",
      complete: (result) => {
        const data = result.data as string[][];
        if (!data.length) {
          reject(new Error("The file appears to be empty."));
          return;
        }
        resolve({ headers: data[0], rows: data.slice(1) });
      },
      error: (err) => reject(new Error(err.message || "Could not parse the file.")),
    });
  });
}

export function toCsv(table: Table): string {
  return Papa.unparse({ fields: table.headers, data: table.rows });
}

export function downloadText(filename: string, text: string, mime = "text/csv") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function baseName(filename: string): string {
  return filename.replace(/\.[^/.]+$/, "");
}

export function formatCount(n: number): string {
  return n.toLocaleString();
}
