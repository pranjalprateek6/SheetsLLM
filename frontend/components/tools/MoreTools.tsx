"use client";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { baseName, downloadBlob, downloadText, formatCount, plural, toCsvAsync, type Table } from "@/lib/csv-tools";
import {
  compareTables,
  extractMatches,
  fillDown,
  sortTable,
  toHtmlTable,
  toMarkdown,
  toSheetRows,
  toSql,
  transposeTable,
  validateTable,
  type ExtractKind,
  type SqlDialect,
} from "@/lib/tool-ops-more";
import { cn } from "@/lib/utils";
import CsvDropzone from "./CsvDropzone";
import ProgressBar from "./ProgressBar";
import { Choice, ColumnPills, Done, ErrorLine, FileLine, Label, Toggle, Warnings } from "./parts";
import { useToolRun } from "./useToolRun";

/* The second set of free tools: check, fill, extract, reshape and convert.
   Same family as NewTools: a CSV dropzone, a few options from ./parts, one
   action, and a plain result line. */

const DataGrid = dynamic(() => import("@/components/DataGrid"), { ssr: false });

const toggleIn = (set: Set<number>, i: number) => {
  const next = new Set(set);
  if (next.has(i)) next.delete(i);
  else next.add(i);
  return next;
};

/** Text output: a preview of the first lines, copy, and download. */
function TextResult({ text, fileName, mime }: { text: string; fileName: string; mime: string }) {
  const [copied, setCopied] = useState(false);
  const preview = text.split("\n").slice(0, 40).join("\n");
  return (
    <div className="mt-5">
      <pre className="max-h-72 overflow-auto rounded-lg border bg-background p-3 font-mono text-[12px] leading-relaxed text-foreground/85">
        {preview}
        {text.split("\n").length > 40 ? "\n…" : ""}
      </pre>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="inverse" onClick={() => downloadText(fileName, text, mime)}>
          <Download className="mr-2 h-4 w-4" /> Download {fileName}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          <Copy className="mr-2 h-4 w-4" /> {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- CSV to Excel */

export function CsvToExcelTool() {
  const t = useToolRun<number>();
  const [infer, setInfer] = useState(true);
  return (
    <div>
      <CsvDropzone hint="or drag it onto this box" onStart={t.reset} onTable={t.load} />
      <Warnings table={t.table} />
      <ErrorLine error={t.error} />
      {t.table && (
        <div className="mt-5">
          <FileLine name={t.fileName} rows={t.table.rows.length} />
          <Toggle checked={infer} onChange={setInfer} label="Store numbers as numbers" hint="So Excel can add them up. Codes with leading zeros stay text." disabled={t.running} />
          <Button
            variant="inverse"
            className="mt-2 w-full sm:w-auto"
            disabled={t.running}
            onClick={() =>
              t.run(async () => {
                const { default: writeExcelFile } = await import("write-excel-file/browser");
                const rows = toSheetRows(t.table!, { infer });
                // A Blob and an ordinary download: toFile() would open the
                // browser's save picker where it exists
                const blob = await writeExcelFile(rows, { sheet: baseName(t.fileName).slice(0, 31) || "Sheet1" }).toBlob();
                downloadBlob(`${baseName(t.fileName)}.xlsx`, blob);
                return t.table!.rows.length;
              }, "Could not write the Excel file.")
            }
          >
            <Download className="mr-2 h-4 w-4" /> {t.running ? "Writing…" : "Convert & download .xlsx"}
          </Button>
          {t.result !== null && <Done>Wrote {plural(t.result, "row")} to {baseName(t.fileName)}.xlsx.</Done>}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- viewer */

export function CsvViewerTool() {
  const t = useToolRun<number>();
  const rows = useMemo(
    () =>
      (t.table?.rows ?? []).map((r) => {
        const o: Record<string, unknown> = {};
        t.table!.headers.forEach((h, i) => {
          o[h] = r[i] === "" ? null : r[i];
        });
        return o;
      }),
    [t.table],
  );
  return (
    <div>
      <CsvDropzone hint="or drag it onto this box" onStart={t.reset} onTable={t.load} />
      <Warnings table={t.table} />
      {t.table && (
        <div className="mt-5">
          <FileLine name={t.fileName} rows={t.table.rows.length} extra={<span className="text-xs text-muted-foreground">{t.table.headers.length} columns</span>} />
          <p className="mb-3 text-[13px] text-muted-foreground">Click a column name to sort; filter rows in the bar under the grid.</p>
          <div className="h-[520px] overflow-hidden rounded-lg border">
            <DataGrid columns={t.table.headers} rows={rows} loading={false} totalRows={rows.length} />
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- compare */

export function CompareTool() {
  const [a, setA] = useState<{ name: string; table: Table } | null>(null);
  const [b, setB] = useState<{ name: string; table: Table } | null>(null);
  const [key, setKey] = useState<string>("");
  const shared = useMemo(() => (a && b ? a.table.headers.filter((h) => b.table.headers.includes(h)) : []), [a, b]);
  const result = useMemo(() => (a && b ? compareTables(a.table, b.table, key || undefined) : null), [a, b, key]);

  const report = async () => {
    if (!result || !a || !b) return;
    const headers = ["Change", "Key", "Column", "Before", "After"];
    const rows: string[][] = [
      ...result.changed.map((c) => ["changed", c.key, c.column, c.before, c.after]),
      ...result.added.map((r) => ["added", key ? r[shared.indexOf(key)] : "", "", "", r.join(" | ")]),
      ...result.removed.map((r) => ["removed", key ? r[shared.indexOf(key)] : "", "", r.join(" | "), ""]),
    ];
    downloadText(`${baseName(a.name)}_vs_${baseName(b.name)}.csv`, await toCsvAsync({ headers, rows }));
  };

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>Before (the older file)</Label>
          <CsvDropzone hint="the earlier export" onStart={() => setA(null)} onTable={(table, name) => { setA({ table, name }); setKey(""); }} />
          {a && <p className="mt-2 text-xs text-muted-foreground">{a.name} · {formatCount(a.table.rows.length)} rows</p>}
        </div>
        <div>
          <Label>After (the newer file)</Label>
          <CsvDropzone hint="the later export" onStart={() => setB(null)} onTable={(table, name) => { setB({ table, name }); setKey(""); }} />
          {b && <p className="mt-2 text-xs text-muted-foreground">{b.name} · {formatCount(b.table.rows.length)} rows</p>}
        </div>
      </div>
      {a && b && result && (
        <div className="mt-6">
          <Label id="cmp-key">Match rows on</Label>
          <Choice
            options={[{ value: "", label: "Whole rows" }, ...shared.map((h) => ({ value: h, label: h }))]}
            value={key}
            onChange={setKey}
            labelId="cmp-key"
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Added", result.added.length],
              ["Removed", result.removed.length],
              [key ? "Cells changed" : "Changed", key ? result.changed.length : 0],
              ["Unchanged", result.same],
            ].map(([label, n]) => (
              <div key={label as string} className="rounded-lg border bg-background px-3 py-2.5">
                <p className="text-[22px] font-medium tabular-nums">{formatCount(n as number)}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
          {(result.onlyBefore.length > 0 || result.onlyAfter.length > 0) && (
            <p className="mt-3 text-[13px] text-muted-foreground">
              {result.onlyAfter.length > 0 && <>New columns: <span className="text-foreground">{result.onlyAfter.join(", ")}</span>. </>}
              {result.onlyBefore.length > 0 && <>Gone: <span className="text-foreground">{result.onlyBefore.join(", ")}</span>.</>}
            </p>
          )}
          {result.duplicateKeys.length > 0 && (
            <p className="mt-2 text-[13px] text-warning-text">
              {key} repeats ({result.duplicateKeys.slice(0, 5).join(", ")}{result.duplicateKeys.length > 5 ? "…" : ""}), so only the first of each is compared.
            </p>
          )}
          {!key && <p className="mt-3 text-[13px] text-muted-foreground">Pick a column that identifies a row, like an order ID, to see which cells changed.</p>}
          {key && result.changed.length > 0 && (
            <div className="mt-4 max-h-72 overflow-auto rounded-lg border">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                  <tr><th className="px-3 py-2">{key}</th><th className="px-3 py-2">Column</th><th className="px-3 py-2">Before</th><th className="px-3 py-2">After</th></tr>
                </thead>
                <tbody>
                  {result.changed.slice(0, 200).map((c, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-1.5 font-mono">{c.key}</td>
                      <td className="px-3 py-1.5">{c.column}</td>
                      <td className="px-3 py-1.5 text-destructive-text line-through decoration-destructive/40">{c.before || "(empty)"}</td>
                      <td className="px-3 py-1.5 text-success-text">{c.after || "(empty)"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Button variant="inverse" className="mt-4 w-full sm:w-auto" onClick={() => void report()} disabled={!result.added.length && !result.removed.length && !result.changed.length}>
            <Download className="mr-2 h-4 w-4" /> Download the differences
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- validator */

export function ValidatorTool() {
  const t = useToolRun<number>();
  const v = useMemo(() => (t.table ? validateTable(t.table) : null), [t.table]);
  return (
    <div>
      <CsvDropzone hint="or drag it onto this box" onStart={t.reset} onTable={t.load} />
      <Warnings table={t.table} />
      {t.table && v && (
        <div className="mt-5">
          <FileLine name={t.fileName} rows={v.rows} extra={<span className="text-xs text-muted-foreground">{v.columns} columns</span>} />
          {v.findings.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-success-text"><CheckCircle2 className="h-4 w-4" /> No problems found: no repeats, no blanks, every column one kind of value.</p>
          ) : (
            <ul className="space-y-1.5">
              {v.findings.slice(0, 40).map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5 max-h-80 overflow-auto rounded-lg border">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                <tr><th className="px-3 py-2">Column</th><th className="px-3 py-2">Looks like</th><th className="px-3 py-2 text-right">Empty</th><th className="px-3 py-2 text-right">Distinct</th><th className="px-3 py-2 text-right">Stray spaces</th></tr>
              </thead>
              <tbody>
                {v.columnsChecked.map((c, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-1.5 font-medium">{c.name}</td>
                    <td className={cn("px-3 py-1.5", c.kind === "mixed" && "text-warning-text")}>{c.kind}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatCount(c.empty)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatCount(c.distinct)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatCount(c.padded)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- transpose */

export function TransposeTool() {
  const t = useToolRun<number>();
  return (
    <div>
      <CsvDropzone hint="or drag it onto this box" onStart={t.reset} onTable={t.load} />
      <Warnings table={t.table} />
      <ErrorLine error={t.error} />
      {t.table && (
        <div className="mt-5">
          <FileLine name={t.fileName} rows={t.table.rows.length} />
          <p className="mb-4 text-[13px] text-muted-foreground">
            {t.table.headers.length} columns × {formatCount(t.table.rows.length)} rows becomes {formatCount(t.table.rows.length + 1)} columns × {t.table.headers.length - 1} rows. {t.table.headers[0] || "The first column"} becomes the header row.
          </p>
          <Button
            variant="inverse"
            className="w-full sm:w-auto"
            disabled={t.running}
            onClick={() =>
              t.run(async (p) => {
                const out = transposeTable(t.table!);
                downloadText(`${baseName(t.fileName)}_transposed.csv`, await toCsvAsync(out, p));
                return out.rows.length;
              }, "Could not transpose the file.")
            }
          >
            <Download className="mr-2 h-4 w-4" /> {t.running ? "Transposing…" : "Transpose & download"}
          </Button>
          {t.result !== null && <Done>Downloaded {baseName(t.fileName)}_transposed.csv with {plural(t.result, "row")}.</Done>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- sort */

export function SortTool() {
  const t = useToolRun<number>();
  const [keys, setKeys] = useState<{ column: number; descending: boolean }[]>([]);
  return (
    <div>
      <CsvDropzone hint="or drag it onto this box" onStart={t.reset} onTable={(table, name) => { t.load(table, name); setKeys([]); }} />
      <Warnings table={t.table} />
      <ErrorLine error={t.error} />
      {t.table && (
        <div className="mt-5">
          <FileLine name={t.fileName} rows={t.table.rows.length} />
          <Label id="sort-cols">Sort by (click in order; click again to switch direction, a third time to remove)</Label>
          <div className="mb-5 flex flex-wrap gap-1.5" role="group" aria-labelledby="sort-cols">
            {t.table.headers.map((h, i) => {
              const at = keys.findIndex((k) => k.column === i);
              const k = keys[at];
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={at >= 0}
                  onClick={() => {
                    t.setResult(null);
                    setKeys((ks) =>
                      at < 0 ? [...ks, { column: i, descending: false }] : !ks[at].descending ? ks.map((x, j) => (j === at ? { ...x, descending: true } : x)) : ks.filter((_, j) => j !== at),
                    );
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[13px] transition-colors",
                    at >= 0 ? "border-primary/60 bg-primary/15 text-foreground" : "bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground",
                  )}
                >
                  {at >= 0 && <span className="mr-1 tabular-nums text-primary-accent">{at + 1}</span>}
                  {h || `(column ${i + 1})`}
                  {k && <span className="ml-1 text-muted-foreground">{k.descending ? "↓" : "↑"}</span>}
                </button>
              );
            })}
          </div>
          <p className="mb-4 text-[13px] text-muted-foreground">Numbers sort as numbers, text in natural order (Item 2 before Item 10), and empty cells go last.</p>
          <Button
            variant="inverse"
            className="w-full sm:w-auto"
            disabled={t.running || keys.length === 0}
            onClick={() =>
              t.run(async (p) => {
                const out = sortTable(t.table!, keys);
                downloadText(`${baseName(t.fileName)}_sorted.csv`, await toCsvAsync(out, p));
                return out.rows.length;
              }, "Could not sort the file.")
            }
          >
            <Download className="mr-2 h-4 w-4" /> {t.running ? "Sorting…" : keys.length === 0 ? "Pick a column to sort by" : "Sort & download"}
          </Button>
          {t.running && <ProgressBar value={t.progress} label="Writing" />}
          {t.result !== null && <Done>Sorted {plural(t.result, "row")} into {baseName(t.fileName)}_sorted.csv.</Done>}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- fill down */

export function FillDownTool() {
  const t = useToolRun<number>();
  const [cols, setCols] = useState<Set<number>>(new Set());
  return (
    <div>
      <CsvDropzone hint="or drag it onto this box" onStart={t.reset} onTable={(table, name) => { t.load(table, name); setCols(new Set()); }} />
      <Warnings table={t.table} />
      <ErrorLine error={t.error} />
      {t.table && (
        <div className="mt-5">
          <FileLine name={t.fileName} rows={t.table.rows.length} />
          <Label id="fill-cols">Columns to fill</Label>
          <ColumnPills headers={t.table.headers} selected={cols} onToggle={(i) => { setCols((c) => toggleIn(c, i)); t.setResult(null); }} labelId="fill-cols" disabled={t.running} />
          <Button
            variant="inverse"
            className="w-full sm:w-auto"
            disabled={t.running || cols.size === 0}
            onClick={() =>
              t.run(async (p) => {
                const out = fillDown(t.table!, Array.from(cols));
                downloadText(`${baseName(t.fileName)}_filled.csv`, await toCsvAsync(out, p));
                return out.changed;
              }, "Could not fill the file.")
            }
          >
            <Download className="mr-2 h-4 w-4" /> {t.running ? "Filling…" : cols.size === 0 ? "Pick at least one column" : "Fill down & download"}
          </Button>
          {t.result !== null && <Done>Filled {plural(t.result, "empty cell")} and downloaded {baseName(t.fileName)}_filled.csv.</Done>}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- extract */

const KINDS: { value: ExtractKind; label: string }[] = [
  { value: "email", label: "Email addresses" },
  { value: "url", label: "Links" },
  { value: "phone", label: "Phone numbers" },
];

export function ExtractTool() {
  const t = useToolRun<number>();
  const [kind, setKind] = useState<ExtractKind>("email");
  const [cols, setCols] = useState<Set<number>>(new Set());
  const found = useMemo(() => (t.table ? extractMatches(t.table, kind, Array.from(cols)) : []), [t.table, kind, cols]);
  return (
    <div>
      <CsvDropzone hint="or drag it onto this box" onStart={t.reset} onTable={(table, name) => { t.load(table, name); setCols(new Set()); }} />
      <Warnings table={t.table} />
      <ErrorLine error={t.error} />
      {t.table && (
        <div className="mt-5">
          <FileLine name={t.fileName} rows={t.table.rows.length} />
          <Label id="ex-kind">Find</Label>
          <Choice options={KINDS} value={kind} onChange={setKind} labelId="ex-kind" />
          <Label id="ex-cols">In these columns (none picked means all of them)</Label>
          <ColumnPills headers={t.table.headers} selected={cols} onToggle={(i) => setCols((c) => toggleIn(c, i))} labelId="ex-cols" />
          <p className="mb-3 text-sm">
            Found <span className="font-medium tabular-nums">{formatCount(found.length)}</span> distinct {KINDS.find((k) => k.value === kind)!.label.toLowerCase()}.
          </p>
          {found.length > 0 && (
            <ul className="mb-4 max-h-48 overflow-auto rounded-lg border bg-background p-2 font-mono text-[12px]">
              {found.slice(0, 100).map((m) => (
                <li key={m.value} className="flex justify-between gap-3 px-1 py-0.5">
                  <span className="truncate">{m.value}</span>
                  <span className="shrink-0 text-muted-foreground">×{m.count}</span>
                </li>
              ))}
            </ul>
          )}
          <Button
            variant="inverse"
            className="w-full sm:w-auto"
            disabled={found.length === 0}
            onClick={() =>
              t.run(async () => {
                const csv = await toCsvAsync({ headers: [KINDS.find((k) => k.value === kind)!.label.replace(/s$/, ""), "Times seen", "First row"], rows: found.map((m) => [m.value, String(m.count), String(m.firstRow)]) });
                downloadText(`${baseName(t.fileName)}_${kind}s.csv`, csv);
                return found.length;
              }, "Could not write the list.")
            }
          >
            <Download className="mr-2 h-4 w-4" /> Download the list
          </Button>
          {t.result !== null && <Done>Downloaded {baseName(t.fileName)}_{kind}s.csv with {plural(t.result, "value")}.</Done>}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- CSV to SQL */

const DIALECTS: { value: SqlDialect; label: string }[] = [
  { value: "postgres", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
  { value: "sqlite", label: "SQLite" },
];

export function CsvToSqlTool() {
  const t = useToolRun<number>();
  const [dialect, setDialect] = useState<SqlDialect>("postgres");
  const [name, setName] = useState("");
  const [create, setCreate] = useState(true);
  const table = name.trim() || baseName(t.fileName).replace(/[^\w]+/g, "_").toLowerCase() || "data";
  const sql = useMemo(() => (t.table ? toSql(t.table, { name: table, dialect, create }) : ""), [t.table, table, dialect, create]);
  return (
    <div>
      <CsvDropzone hint="or drag it onto this box" onStart={t.reset} onTable={(tb, n) => { t.load(tb, n); setName(""); }} />
      <Warnings table={t.table} />
      {t.table && (
        <div className="mt-5">
          <FileLine name={t.fileName} rows={t.table.rows.length} />
          <Label id="sql-dialect">Database</Label>
          <Choice options={DIALECTS} value={dialect} onChange={setDialect} labelId="sql-dialect" />
          <Label>Table name</Label>
          <Input className="mb-4 max-w-xs" value={name} placeholder={table} onChange={(e) => setName(e.target.value)} />
          <Toggle checked={create} onChange={setCreate} label="Include CREATE TABLE" hint="Column types are read from the values: whole numbers, decimals, true/false or text." />
          <TextResult text={sql} fileName={`${table}.sql`} mime="application/sql" />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------ CSV to Markdown/HTML */

export function CsvToTableTool() {
  const t = useToolRun<number>();
  const [format, setFormat] = useState<"markdown" | "html">("markdown");
  const text = useMemo(() => (t.table ? (format === "markdown" ? toMarkdown(t.table) : toHtmlTable(t.table)) : ""), [t.table, format]);
  return (
    <div>
      <CsvDropzone hint="or drag it onto this box" onStart={t.reset} onTable={t.load} />
      <Warnings table={t.table} />
      {t.table && (
        <div className="mt-5">
          <FileLine name={t.fileName} rows={t.table.rows.length} />
          <Label id="tbl-format">Format</Label>
          <Choice options={[{ value: "markdown", label: "Markdown" }, { value: "html", label: "HTML" }]} value={format} onChange={setFormat} labelId="tbl-format" />
          {t.table.rows.length > 1000 && <p className="mb-2 text-[13px] text-warning-text">That is a long table to paste anywhere: {formatCount(t.table.rows.length)} rows.</p>}
          <TextResult text={text} fileName={`${baseName(t.fileName)}.${format === "markdown" ? "md" : "html"}`} mime={format === "markdown" ? "text/markdown" : "text/html"} />
        </div>
      )}
    </div>
  );
}
