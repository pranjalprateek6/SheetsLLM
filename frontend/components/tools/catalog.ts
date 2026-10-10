import {
  ArrowLeftRight, CaseSensitive, Columns3, Copy, FileJson, FileSpreadsheet, Layers, Replace, Scissors, Sparkles,
  SplitSquareHorizontal, Braces, type LucideIcon,
} from "lucide-react";

/* The free tools, in one place: the index (grouped), each tool page's
   "More free tools" row, and the footer all read this list. */

export type ToolGroup = "Clean" | "Reshape" | "Convert";

export type Tool = {
  href: string;
  name: string;
  /** The footer's shorter label */
  short: string;
  desc: string;
  icon: LucideIcon;
  group: ToolGroup;
  /** Shown in the footer's short list */
  popular?: boolean;
};

export const GROUPS: { name: ToolGroup; blurb: string }[] = [
  { name: "Clean", blurb: "Fix what is in the cells" },
  { name: "Reshape", blurb: "Change the rows and columns" },
  { name: "Convert", blurb: "Move between formats" },
];

export const TOOLS: Tool[] = [
  // Clean
  { href: "/tools/csv-cleaner", name: "CSV cleaner", short: "CSV cleaner", group: "Clean", popular: true, icon: Sparkles,
    desc: "Trim whitespace, drop empty rows and columns, collapse double spaces." },
  { href: "/tools/csv-deduplicate", name: "CSV duplicate remover", short: "Remove duplicates", group: "Clean", popular: true, icon: Copy,
    desc: "Delete duplicate rows, matching on the whole row or the columns you pick." },
  { href: "/tools/csv-find-replace", name: "Find and replace", short: "Find and replace", group: "Clean", icon: Replace,
    desc: "Replace text across a whole CSV or in the columns you choose." },
  { href: "/tools/change-case", name: "Change text case", short: "Change case", group: "Clean", icon: CaseSensitive,
    desc: "Make names and labels Title Case, UPPERCASE, lowercase or Sentence case." },
  // Reshape
  { href: "/tools/merge-csv", name: "Merge CSV files", short: "Merge CSVs", group: "Reshape", popular: true, icon: Layers,
    desc: "Stack several CSVs into one, lining columns up by name." },
  { href: "/tools/csv-splitter", name: "CSV splitter", short: "Split a CSV", group: "Reshape", icon: Scissors,
    desc: "Cut a huge CSV into Excel-safe parts, each keeping the header row." },
  { href: "/tools/csv-columns", name: "Remove or reorder columns", short: "Remove columns", group: "Reshape", icon: Columns3,
    desc: "Keep only the columns you need, in the order you want." },
  { href: "/tools/split-column", name: "Split a column", short: "Split a column", group: "Reshape", icon: SplitSquareHorizontal,
    desc: "Turn one column into two or more: Full name into First and Last." },
  // Convert
  { href: "/tools/excel-to-csv", name: "Excel to CSV converter", short: "Excel to CSV", group: "Convert", popular: true, icon: FileSpreadsheet,
    desc: "Save any sheet of an .xlsx workbook as a CSV, or every sheet at once." },
  { href: "/tools/json-to-csv", name: "JSON to CSV converter", short: "JSON to CSV", group: "Convert", popular: true, icon: FileJson,
    desc: "Flatten a JSON array into a spreadsheet-ready CSV, nested keys included." },
  { href: "/tools/csv-to-json", name: "CSV to JSON converter", short: "CSV to JSON", group: "Convert", icon: Braces,
    desc: "Turn a CSV into a JSON array, with numbers detected and dotted keys nested." },
  { href: "/tools/csv-delimiter", name: "CSV delimiter converter", short: "Change delimiter", group: "Convert", icon: ArrowLeftRight,
    desc: "Switch between comma, semicolon, tab and pipe separated files." },
];

/** Four tools to suggest from a tool page: its own group first, then others. */
export function relatedTools(href: string, count = 4): Tool[] {
  const self = TOOLS.find((t) => t.href === href);
  const others = TOOLS.filter((t) => t.href !== href);
  const same = others.filter((t) => t.group === self?.group);
  const rest = others.filter((t) => t.group !== self?.group && t.popular);
  return [...same, ...rest].slice(0, count);
}
