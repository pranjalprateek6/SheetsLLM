/** Pasted cells become a file the upload path already understands. A paste
 *  from a spreadsheet is tab-separated; from a text editor it may be commas
 *  or semicolons. The delimiter decides the extension, and the engine's
 *  sniffer does the rest. */

export type PasteShape = { rows: number; delimiter: "tab" | "comma" | "semicolon" };

export function describePaste(text: string): PasteShape | null {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length === 0) return null;
  const first = lines[0];
  const count = (ch: string) => first.split(ch).length - 1;
  const tabs = count("\t");
  const commas = count(",");
  const semis = count(";");
  const delimiter = tabs > 0 && tabs >= commas ? "tab" : semis > commas ? "semicolon" : "comma";
  return { rows: lines.length, delimiter };
}

/** A File for the pasted text, or null when there is nothing in it. */
export function pastedToFile(text: string, name = "pasted"): File | null {
  const shape = describePaste(text);
  if (!shape) return null;
  const body = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "") + "\n";
  const ext = shape.delimiter === "tab" ? "tsv" : "csv";
  return new File([body], `${name}.${ext}`, { type: "text/plain" });
}
