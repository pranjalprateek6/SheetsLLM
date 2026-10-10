"use client";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, FileSpreadsheet, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  baseName,
  downloadText,
  formatCount,
  parseCsvFile,
  plural,
  toCsvAsync,
  type Table,
} from "@/lib/csv-tools";
import {
  changeCase,
  DELIMITERS,
  delimiterLabel,
  findReplace,
  mergeTables,
  pickColumns,
  sheetToGrid,
  splitColumn,
  toCase,
  toRecords,
  type CaseMode,
} from "@/lib/tool-ops";
import { cn } from "@/lib/utils";
import CsvDropzone from "./CsvDropzone";
import ProgressBar from "./ProgressBar";
import { Choice, ColumnPills, Done, ErrorLine, FileLine, Label, Toggle, Warnings } from "./parts";
import { useToolRun } from "./useToolRun";

/* The eight newer free tools. Each is a CSV dropzone, a few options built
   from ./parts, one light-pill action, and a plain result line. */

const toggleIn = (set: Set<number>, i: number) => {
  const next = new Set(set);
  if (next.has(i)) next.delete(i);
  else next.add(i);
  return next;
};

/* ---------------------------------------------------------- merge CSVs */

type Loaded = { name: string; table: Table };

export function MergeTool() {
  const [files, setFiles] = useState<Loaded[]>([]);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [source, setSource] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState<{ rows: number; cols: number; added: string[] } | null>(null);

  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    setReading(true);
    setError(null);
    setDone(null);
    try {
      const read: Loaded[] = [];
      for (const f of Array.from(list)) read.push({ name: f.name, table: await parseCsvFile(f) });
      setFiles((prev) => [...prev, ...read]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read one of the files.");
    } finally {
      setReading(false);
    }
  };

  const run = async () => {
    setRunning(true);
    setProgress(0);
    setError(null);
    try {
      const merged = mergeTables(files, { source });
      const csv = await toCsvAsync(merged, setProgress);
      downloadText("merged.csv", csv);
      setDone({ rows: merged.rows.length, cols: merged.headers.length, added: merged.added });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not merge the files.");
    } finally {
      setRunning(false);
    }
  };

  const total = files.reduce((n, f) => n + f.table.rows.length, 0);
  return (
    <div>
      <label
        className={cn(
          "flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border transition-colors hover:border-primary/50 hover:bg-primary/[0.03] focus-within:border-primary focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          files.length ? "px-4 py-3" : "p-10",
          dragging && "border-primary bg-primary/[0.05]",
          reading && "cursor-progress opacity-60",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
      >
        <input
          type="file"
          multiple
          accept=".csv,.tsv,.txt"
          className="sr-only"
          disabled={reading}
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
        {files.length ? (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Upload className="h-4 w-4 text-primary-accent" aria-hidden />
            <span className="font-medium text-foreground">{reading ? "Reading…" : "Add more files"}</span> or drop them here
          </p>
        ) : (
          <div className="text-center">
            <Upload className="mx-auto mb-2 h-6 w-6 text-primary-accent" />
            <p className="text-sm font-medium">{reading ? "Reading…" : "Choose two or more CSV files"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">or drag them onto this box</p>
          </div>
        )}
      </label>
      <ErrorLine error={error} />

      {files.length > 0 && (
        <div className="mt-5">
          <ul className="mb-4 divide-y rounded-lg border">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {plural(f.table.rows.length, "row")} · {plural(f.table.headers.length, "column")}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => {
                    setFiles((prev) => prev.filter((_, k) => k !== i));
                    setDone(null);
                  }}
                  className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <Toggle
            checked={source}
            onChange={setSource}
            label="Add a Source file column"
            hint="Says which file each row came from."
            disabled={running}
          />
          <Button variant="inverse" onClick={run} disabled={running || files.length < 2} className="mt-2 w-full sm:w-auto">
            <Download className="mr-2 h-4 w-4" />
            {running ? "Merging…" : files.length < 2 ? "Add another file to merge" : `Merge ${files.length} files & download`}
          </Button>
          {running && <ProgressBar value={progress} label="Merging" />}
          {done && (
            <Done>
              Merged {plural(total, "row")} into merged.csv with {plural(done.cols, "column")}.
              {done.added.length > 0 &&
                ` Not every file had ${done.added.join(", ")}; those cells are empty where a file had no such column.`}
            </Done>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- CSV to JSON */

export function CsvToJsonTool() {
  const t = useToolRun<number>();
  const [infer, setInfer] = useState(true);
  const [nest, setNest] = useState(false);
  const [pretty, setPretty] = useState(true);
  const preview = useMemo(() => {
    if (!t.table) return "";
    const sample = toRecords({ headers: t.table.headers, rows: t.table.rows.slice(0, 1) }, { infer, nest });
    return JSON.stringify(sample[0] ?? {}, null, 2);
  }, [t.table, infer, nest]);

  return (
    <div>
      <CsvDropzone hint="or drag it onto this box" onStart={t.reset} onTable={t.load} />
      <Warnings table={t.table} />
      <ErrorLine error={t.error} />
      {t.table && (
        <div className="mt-5">
          <FileLine name={t.fileName} rows={t.table.rows.length} />
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <Toggle checked={infer} onChange={setInfer} label="Detect numbers and true/false" hint="IDs with leading zeros stay text." disabled={t.running} />
              <Toggle checked={nest} onChange={setNest} label="Nest dotted headers" hint={'"address.city" becomes {"address": {"city": …}}.'} disabled={t.running} />
              <Toggle checked={pretty} onChange={setPretty} label="Indent the output" hint="Easier to read; a little larger." disabled={t.running} />
            </div>
            <div>
              <Label>First record</Label>
              <pre className="max-h-48 overflow-auto rounded-lg border bg-background p-3 font-mono text-[12px] leading-relaxed text-foreground/85">{preview}</pre>
            </div>
          </div>
          <Button
            variant="inverse"
            className="mt-5 w-full sm:w-auto"
            disabled={t.running}
            onClick={() =>
              t.run(async () => {
                const records = toRecords(t.table!, { infer, nest });
                downloadText(`${baseName(t.fileName)}.json`, JSON.stringify(records, null, pretty ? 2 : 0), "application/json");
                return records.length;
              }, "Could not convert the file.")
            }
          >
            <Download className="mr-2 h-4 w-4" /> {t.running ? "Converting…" : "Convert & download JSON"}
          </Button>
          {t.result !== null && <Done>Converted {plural(t.result, "row")} into {baseName(t.fileName)}.json.</Done>}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------- remove / reorder columns */

export function ColumnsTool() {
  const t = useToolRun<number>();
  const [order, setOrder] = useState<number[]>([]);
  const [keep, setKeep] = useState<Set<number>>(new Set());

  const move = (pos: number, by: -1 | 1) =>
    setOrder((o) => {
      const next = o.slice();
      const to = pos + by;
      if (to < 0 || to >= next.length) return o;
      [next[pos], next[to]] = [next[to], next[pos]];
      return next;
    });

  const kept = order.filter((i) => keep.has(i));
  return (
    <div>
      <CsvDropzone
        hint="or drag it onto this box"
        onStart={t.reset}
        onTable={(table, name) => {
          t.load(table, name);
          setOrder(table.headers.map((_, i) => i));
          setKeep(new Set(table.headers.map((_, i) => i)));
        }}
      />
      <Warnings table={t.table} />
      <ErrorLine error={t.error} />
      {t.table && (
        <div className="mt-5">
          <FileLine name={t.fileName} rows={t.table.rows.length} />
          <div className="mb-2 flex items-center justify-between">
            <Label>Columns to keep, in order</Label>
            <div className="flex gap-3 text-xs">
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setKeep(new Set(order))}>
                Keep all
              </button>
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setKeep(new Set())}>
                Keep none
              </button>
            </div>
          </div>
          <ul className="mb-5 divide-y rounded-lg border">
            {order.map((col, pos) => (
              <li key={col} className={cn("flex items-center gap-3 px-3 py-1.5", !keep.has(col) && "opacity-50")}>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                  checked={keep.has(col)}
                  onChange={() => setKeep((k) => toggleIn(k, col))}
                  aria-label={`Keep ${t.table!.headers[col]}`}
                />
                <span className={cn("min-w-0 flex-1 truncate text-sm", !keep.has(col) && "line-through")}>
                  {t.table!.headers[col] || `(column ${col + 1})`}
                </span>
                <button type="button" aria-label={`Move ${t.table!.headers[col]} up`} disabled={pos === 0} onClick={() => move(pos, -1)} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label={`Move ${t.table!.headers[col]} down`} disabled={pos === order.length - 1} onClick={() => move(pos, 1)} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <Button
            variant="inverse"
            className="w-full sm:w-auto"
            disabled={t.running || kept.length === 0}
            onClick={() =>
              t.run(async (p) => {
                const csv = await toCsvAsync(pickColumns(t.table!, kept), p);
                downloadText(`${baseName(t.fileName)}_columns.csv`, csv);
                return kept.length;
              }, "Could not write the file.")
            }
          >
            <Download className="mr-2 h-4 w-4" />
            {t.running ? "Writing…" : kept.length === 0 ? "Keep at least one column" : `Download with ${plural(kept.length, "column")}`}
          </Button>
          {t.running && <ProgressBar value={t.progress} label="Writing" />}
          {t.result !== null && <Done>Downloaded {baseName(t.fileName)}_columns.csv with {plural(t.result, "column")}.</Done>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------- find & replace */

export function FindReplaceTool() {
  const t = useToolRun<number>();
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [cols, setCols] = useState<Set<number>>(new Set());
  const [matchCase, setMatchCase] = useState(false);
  const [wholeCell, setWholeCell] = useState(false);
  const opts = { find, replace, columns: cols.size ? Array.from(cols) : null, matchCase, wholeCell };
  const preview = useMemo(() => (t.table && find ? findReplace(t.table, opts).changed : 0), [t.table, find, replace, cols, matchCase, wholeCell]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <CsvDropzone hint="or drag it onto this box" onStart={t.reset} onTable={(table, name) => { t.load(table, name); setCols(new Set()); }} />
      <Warnings table={t.table} />
      <ErrorLine error={t.error} />
      {t.table && (
        <div className="mt-5">
          <FileLine name={t.fileName} rows={t.table.rows.length} />
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="fr-find" className="mb-1.5 block text-xs font-medium text-muted-foreground">Find</label>
              <Input id="fr-find" value={find} onChange={(e) => { setFind(e.target.value); t.setResult(null); }} placeholder="e.g. N/A" />
            </div>
            <div>
              <label htmlFor="fr-replace" className="mb-1.5 block text-xs font-medium text-muted-foreground">Replace with</label>
              <Input id="fr-replace" value={replace} onChange={(e) => { setReplace(e.target.value); t.setResult(null); }} placeholder="Leave empty to delete it" />
            </div>
          </div>
          <Label id="fr-cols">Search in (none selected = every column)</Label>
          <ColumnPills headers={t.table.headers} selected={cols} onToggle={(i) => setCols((c) => toggleIn(c, i))} labelId="fr-cols" disabled={t.running} />
          <Toggle checked={matchCase} onChange={setMatchCase} label="Match case" disabled={t.running} />
          <Toggle checked={wholeCell} onChange={setWholeCell} label="Whole cell only" hint="Replace a cell only when its whole value matches." disabled={t.running} />
          <Button
            variant="inverse"
            className="mt-2 w-full sm:w-auto"
            disabled={t.running || !find}
            onClick={() =>
              t.run(async (p) => {
                const r = findReplace(t.table!, opts);
                const csv = await toCsvAsync(r, p);
                downloadText(`${baseName(t.fileName)}_replaced.csv`, csv);
                return r.changed;
              }, "Could not replace in the file.")
            }
          >
            <Download className="mr-2 h-4 w-4" />
            {t.running ? "Replacing…" : !find ? "Type something to find" : `Replace in ${plural(preview, "cell")} & download`}
          </Button>
          {t.running && <ProgressBar value={t.progress} label="Writing" />}
          {t.result !== null && <Done>Replaced in {plural(t.result, "cell")} and downloaded {baseName(t.fileName)}_replaced.csv.</Done>}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------- delimiter converter */

export function DelimiterTool() {
  const t = useToolRun<string>();
  const [to, setTo] = useState<string>(",");
  const target = DELIMITERS.find((d) => d.value === to)!;
  return (
    <div>
      <CsvDropzone
        hint="comma, semicolon, tab or pipe; detected for you"
        onStart={t.reset}
        onTable={(table, name) => {
          t.load(table, name);
          // Offer the most likely conversion: anything but comma goes to comma
          setTo(table.delimiter === "," ? ";" : ",");
        }}
      />
      <Warnings table={t.table} />
      <ErrorLine error={t.error} />
      {t.table && (
        <div className="mt-5">
          <FileLine
            name={t.fileName}
            rows={t.table.rows.length}
            extra={<Badge variant="outline">separated by {delimiterLabel(t.table.delimiter).toLowerCase()}</Badge>}
          />
          <Label id="delim-to">Convert to</Label>
          <Choice
            options={DELIMITERS.map((d) => ({ value: d.value, label: d.label }))}
            value={to as (typeof DELIMITERS)[number]["value"]}
            onChange={(v) => { setTo(v); t.setResult(null); }}
            labelId="delim-to"
            disabled={t.running}
          />
          <Button
            variant="inverse"
            className="w-full sm:w-auto"
            disabled={t.running}
            onClick={() =>
              t.run(async (p) => {
                const text = await toCsvAsync(t.table!, p, to);
                const name = `${baseName(t.fileName)}_${target.ext === "tsv" ? "tabs" : target.label.split(" ")[0].toLowerCase()}.${target.ext}`;
                downloadText(name, text, target.ext === "tsv" ? "text/tab-separated-values" : "text/csv");
                return name;
              }, "Could not write the file.")
            }
          >
            <Download className="mr-2 h-4 w-4" /> {t.running ? "Converting…" : "Convert & download"}
          </Button>
          {t.running && <ProgressBar value={t.progress} label="Converting" />}
          {t.result && <Done>Downloaded {t.result}, separated by {target.label.toLowerCase()}.</Done>}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- split column */

const SEPARATORS = [
  { value: "space", label: "Space", sep: " " },
  { value: "comma", label: "Comma", sep: "," },
  { value: "hyphen", label: "Hyphen", sep: "-" },
  { value: "slash", label: "Slash", sep: "/" },
  { value: "custom", label: "Other…", sep: "" },
] as const;

export function SplitColumnTool() {
  const t = useToolRun<number>();
  const [col, setCol] = useState<number | null>(null);
  const [sepKey, setSepKey] = useState<(typeof SEPARATORS)[number]["value"]>("space");
  const [custom, setCustom] = useState("");
  const [two, setTwo] = useState(true);
  const [names, setNames] = useState(["First", "Last"]);
  const [keepOriginal, setKeepOriginal] = useState(false);
  const sep = sepKey === "custom" ? custom : SEPARATORS.find((s) => s.value === sepKey)!.sep;
  const example = useMemo(() => {
    if (!t.table || col === null) return null;
    const row = t.table.rows.find((r) => (r[col] ?? "").includes(sep || " "));
    if (!row) return null;
    const out = splitColumn({ headers: t.table.headers, rows: [row] }, col, sep, { parts: two ? 2 : undefined, names: two ? names : undefined });
    return { from: row[col], to: out.rows[0].slice(col, col + out.width) };
  }, [t.table, col, sep, two, names]);

  return (
    <div>
      <CsvDropzone hint="or drag it onto this box" onStart={t.reset} onTable={(table, name) => { t.load(table, name); setCol(null); }} />
      <Warnings table={t.table} />
      <ErrorLine error={t.error} />
      {t.table && (
        <div className="mt-5">
          <FileLine name={t.fileName} rows={t.table.rows.length} />
          <Label id="split-col">Column to split</Label>
          <ColumnPills headers={t.table.headers} selected={new Set(col === null ? [] : [col])} onToggle={(i) => { setCol(i); t.setResult(null); }} labelId="split-col" disabled={t.running} />
          <Label id="split-sep">Split on</Label>
          <Choice options={SEPARATORS} value={sepKey} onChange={setSepKey} labelId="split-sep" disabled={t.running} />
          {sepKey === "custom" && (
            <Input aria-label="Separator" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. |" className="mb-5 w-40" />
          )}
          <Toggle checked={two} onChange={setTwo} label="Split into two columns" hint="The first part, then everything after it. Off: as many columns as the longest cell needs." disabled={t.running} />
          {two && (
            <div className="mb-4 ml-12 grid max-w-sm grid-cols-2 gap-2">
              {[0, 1].map((i) => (
                <Input key={i} aria-label={`Name of column ${i + 1}`} value={names[i]} onChange={(e) => setNames((n) => n.map((v, k) => (k === i ? e.target.value : v)))} />
              ))}
            </div>
          )}
          <Toggle checked={keepOriginal} onChange={setKeepOriginal} label="Keep the original column" disabled={t.running} />
          {example && (
            <p className="mb-4 text-[13px] text-muted-foreground">
              <span className="text-foreground">{example.from}</span> becomes{" "}
              {example.to.map((v, i) => (
                <span key={i} className="mx-0.5 rounded-md border bg-background px-1.5 py-0.5 text-foreground">{v || "empty"}</span>
              ))}
            </p>
          )}
          <Button
            variant="inverse"
            className="w-full sm:w-auto"
            disabled={t.running || col === null || !sep}
            onClick={() =>
              t.run(async (p) => {
                const r = splitColumn(t.table!, col!, sep, { parts: two ? 2 : undefined, keepOriginal, names: two ? names : undefined });
                const csv = await toCsvAsync(r, p);
                downloadText(`${baseName(t.fileName)}_split.csv`, csv);
                return r.width;
              }, "Could not split the column.")
            }
          >
            <Download className="mr-2 h-4 w-4" />
            {t.running ? "Splitting…" : col === null ? "Pick a column to split" : "Split & download"}
          </Button>
          {t.running && <ProgressBar value={t.progress} label="Writing" />}
          {t.result !== null && col !== null && (
            <Done>Split {t.table.headers[col]} into {plural(t.result, "column")} and downloaded {baseName(t.fileName)}_split.csv.</Done>
          )}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- change case */

const CASES: { value: CaseMode; label: string }[] = [
  { value: "title", label: "Title Case" },
  { value: "upper", label: "UPPERCASE" },
  { value: "lower", label: "lowercase" },
  { value: "sentence", label: "Sentence case" },
];

export function CaseTool() {
  const t = useToolRun<number>();
  const [cols, setCols] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<CaseMode>("title");
  const sample = useMemo(() => {
    if (!t.table || !cols.size) return null;
    const c = Array.from(cols)[0];
    const v = t.table.rows.find((r) => r[c])?.[c];
    return v ? { from: v, to: toCase(v, mode) } : null;
  }, [t.table, cols, mode]);

  return (
    <div>
      <CsvDropzone hint="or drag it onto this box" onStart={t.reset} onTable={(table, name) => { t.load(table, name); setCols(new Set()); }} />
      <Warnings table={t.table} />
      <ErrorLine error={t.error} />
      {t.table && (
        <div className="mt-5">
          <FileLine name={t.fileName} rows={t.table.rows.length} />
          <Label id="case-cols">Columns to change</Label>
          <ColumnPills headers={t.table.headers} selected={cols} onToggle={(i) => { setCols((c) => toggleIn(c, i)); t.setResult(null); }} labelId="case-cols" disabled={t.running} />
          <Label id="case-mode">Change to</Label>
          <Choice options={CASES} value={mode} onChange={(v) => { setMode(v); t.setResult(null); }} labelId="case-mode" disabled={t.running} />
          {sample && (
            <p className="mb-4 text-[13px] text-muted-foreground">
              <span className="text-foreground">{sample.from}</span> becomes <span className="text-foreground">{sample.to}</span>
            </p>
          )}
          <Button
            variant="inverse"
            className="w-full sm:w-auto"
            disabled={t.running || cols.size === 0}
            onClick={() =>
              t.run(async (p) => {
                const r = changeCase(t.table!, Array.from(cols), mode);
                const csv = await toCsvAsync(r, p);
                downloadText(`${baseName(t.fileName)}_${mode}.csv`, csv);
                return r.changed;
              }, "Could not change the case.")
            }
          >
            <Download className="mr-2 h-4 w-4" />
            {t.running ? "Changing…" : cols.size === 0 ? "Pick at least one column" : "Change case & download"}
          </Button>
          {t.running && <ProgressBar value={t.progress} label="Writing" />}
          {t.result !== null && <Done>Changed {plural(t.result, "cell")} and downloaded {baseName(t.fileName)}_{mode}.csv.</Done>}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- Excel to CSV */

type Sheet = { name: string; headers: string[]; rows: string[][] };

export function ExcelToCsvTool() {
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [pick, setPick] = useState(0);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const read = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setError(null);
    setDone(null);
    setSheets(null);
    try {
      if (!/\.xlsx$/i.test(file.name)) {
        throw new Error("This reads .xlsx files. For an older .xls file, open it in Excel and save it as .xlsx first.");
      }
      // Loaded only on this page, so no other page pays for the library
      const { default: readXlsxFile } = await import("read-excel-file/browser");
      const all = await readXlsxFile(file);
      const parsed = all.map((s) => ({ name: s.sheet, ...sheetToGrid(s.data as unknown[][]) }));
      if (!parsed.length) throw new Error("This workbook has no sheets.");
      setSheets(parsed);
      setFileName(file.name);
      setPick(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the workbook.");
    } finally {
      setReading(false);
    }
  };

  const download = async (indexes: number[]) => {
    if (!sheets) return;
    const names: string[] = [];
    for (const i of indexes) {
      const s = sheets[i];
      const csv = await toCsvAsync(s);
      const name = sheets.length > 1 ? `${baseName(fileName)}_${s.name.replace(/[^\w-]+/g, "_")}.csv` : `${baseName(fileName)}.csv`;
      downloadText(name, csv);
      names.push(name);
    }
    setDone(names.join(", "));
  };

  const s = sheets?.[pick];
  return (
    <div>
      <label
        className={cn(
          "flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border transition-colors hover:border-primary/50 hover:bg-primary/[0.03] focus-within:border-primary focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          sheets ? "px-4 py-3" : "p-10",
          dragging && "border-primary bg-primary/[0.05]",
          reading && "cursor-progress opacity-60",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          read(e.dataTransfer.files?.[0]);
        }}
      >
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          disabled={reading}
          onChange={(e) => {
            read(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {sheets ? (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Upload className="h-4 w-4 text-primary-accent" aria-hidden />
            <span className="font-medium text-foreground">Choose another workbook</span> or drop it here
          </p>
        ) : (
          <div className="text-center">
            <Upload className="mx-auto mb-2 h-6 w-6 text-primary-accent" />
            <p className="text-sm font-medium">{reading ? "Reading…" : "Choose an Excel file (.xlsx)"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">or drag it onto this box</p>
          </div>
        )}
      </label>
      <ErrorLine error={error} />

      {sheets && s && (
        <div className="mt-5">
          <FileLine name={fileName} rows={s.rows.length} extra={<Badge variant="outline">{plural(sheets.length, "sheet")}</Badge>} />
          {sheets.length > 1 && (
            <>
              <Label id="xl-sheet">Sheet</Label>
              <Choice
                options={sheets.map((x, i) => ({ value: String(i), label: `${x.name} · ${formatCount(x.rows.length)} rows` }))}
                value={String(pick)}
                onChange={(v) => { setPick(Number(v)); setDone(null); }}
                labelId="xl-sheet"
              />
            </>
          )}
          <Label>Columns</Label>
          <p className="mb-5 text-[13px] text-muted-foreground">{s.headers.join(" · ") || "No columns"}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="inverse" onClick={() => download([pick])} className="w-full sm:w-auto">
              <Download className="mr-2 h-4 w-4" /> Download {sheets.length > 1 ? `"${s.name}"` : "the sheet"} as CSV
            </Button>
            {sheets.length > 1 && (
              <Button variant="glass" onClick={() => download(sheets.map((_, i) => i))} className="w-full sm:w-auto">
                Download all {sheets.length} sheets
              </Button>
            )}
          </div>
          {done && <Done>Downloaded {done}.</Done>}
        </div>
      )}
    </div>
  );
}
