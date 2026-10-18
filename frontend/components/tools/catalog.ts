import {
  ArrowDownToLine, ArrowLeftRight, ArrowUpDown, AtSign, CaseSensitive, Columns3, Copy, Database, Eye, FileJson,
  FileSpreadsheet, GitCompareArrows, Grid3x3, Layers, Replace, Scissors, Sheet, ShieldCheck, Sparkles,
  SplitSquareHorizontal, Braces, Table2, type LucideIcon,
} from "lucide-react";

/* The free tools, in one place: the index (grouped), each tool page's
   "More free tools" row, and the footer all read this list. */

export type ToolGroup = "Check" | "Clean" | "Reshape" | "Convert";

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
  /** What the same job looks like inside the app, for the hook under the tool */
  recipe: string;
};

export const GROUPS: { name: ToolGroup; blurb: string }[] = [
  { name: "Check", blurb: "See what is in a file before you touch it" },
  { name: "Clean", blurb: "Fix what is in the cells" },
  { name: "Reshape", blurb: "Change the rows and columns" },
  { name: "Convert", blurb: "Move between formats" },
];

export const TOOLS: Tool[] = [
  // Check
  { href: "/tools/csv-viewer", name: "CSV viewer", short: "CSV viewer", group: "Check", popular: true, icon: Eye,
    desc: "Open a large CSV as a grid you can scroll, sort and filter, without Excel.",
    recipe: "a file opens as a grid that keeps every step you take" },
  { href: "/tools/csv-compare", name: "Compare two CSV files", short: "Compare CSVs", group: "Check", popular: true, icon: GitCompareArrows,
    desc: "See the rows added, removed and changed between two exports, matched on an ID.",
    recipe: "a recipe run says what changed in this month's file" },
  { href: "/tools/csv-validator", name: "CSV validator", short: "Validate a CSV", group: "Check", icon: ShieldCheck,
    desc: "Check a CSV for repeated rows, empty cells, mixed values and stray spaces.",
    recipe: "every upload is checked like this, with a one-click fix for each finding" },
  // Clean
  { href: "/tools/csv-cleaner", name: "CSV cleaner", short: "CSV cleaner", group: "Clean", popular: true, icon: Sparkles,
    desc: "Trim whitespace, drop empty rows and columns, collapse double spaces.",
    recipe: "trimming and dropping empty rows are one-click steps" },
  { href: "/tools/csv-deduplicate", name: "CSV duplicate remover", short: "Remove duplicates", group: "Clean", popular: true, icon: Copy,
    desc: "Delete duplicate rows, matching on the whole row or the columns you pick.",
    recipe: "removing duplicates is a one-click step" },
  { href: "/tools/csv-find-replace", name: "Find and replace", short: "Find and replace", group: "Clean", icon: Replace,
    desc: "Replace text across a whole CSV or in the columns you choose.",
    recipe: "a find and replace is one step you describe in plain words" },
  { href: "/tools/change-case", name: "Change text case", short: "Change case", group: "Clean", icon: CaseSensitive,
    desc: "Make names and labels Title Case, UPPERCASE, lowercase or Sentence case.",
    recipe: "fixing the case of a column is one step" },
  { href: "/tools/fill-down", name: "Fill down blank cells", short: "Fill down", group: "Clean", icon: ArrowDownToLine,
    desc: "Fill empty cells with the value above, the way a report lists a group's name once.",
    recipe: "filling empty cells is a one-click step" },
  { href: "/tools/extract-emails", name: "Extract emails, links and phone numbers", short: "Extract emails", group: "Clean", icon: AtSign,
    desc: "Pull every email address, link or phone number out of a CSV, once each.",
    recipe: "a column of messy contacts is cleaned by a step you describe in plain words" },
  // Reshape
  { href: "/tools/merge-csv", name: "Merge CSV files", short: "Merge CSVs", group: "Reshape", popular: true, icon: Layers,
    desc: "Stack several CSVs into one, lining columns up by name.",
    recipe: "the cleanup that follows a merge is a set of steps" },
  { href: "/tools/csv-splitter", name: "CSV splitter", short: "Split a CSV", group: "Reshape", icon: Scissors,
    desc: "Cut a huge CSV into Excel-safe parts, each keeping the header row.",
    recipe: "the cleanup before a split is a set of steps" },
  { href: "/tools/csv-columns", name: "Remove or reorder columns", short: "Remove columns", group: "Reshape", icon: Columns3,
    desc: "Keep only the columns you need, in the order you want.",
    recipe: "dropping and renaming columns are one-click steps" },
  { href: "/tools/split-column", name: "Split a column", short: "Split a column", group: "Reshape", icon: SplitSquareHorizontal,
    desc: "Turn one column into two or more: Full name into First and Last.",
    recipe: "splitting a column is one step you describe in plain words" },
  { href: "/tools/sort-csv", name: "Sort a CSV", short: "Sort a CSV", group: "Reshape", icon: ArrowUpDown,
    desc: "Sort by one or more columns: numbers as numbers, text in natural order.",
    recipe: "sorting every row is a one-click step" },
  { href: "/tools/transpose-csv", name: "Transpose a CSV", short: "Transpose", group: "Reshape", icon: Grid3x3,
    desc: "Turn rows into columns and columns into rows.",
    recipe: "reshaping a file is a step you describe in plain words" },
  // Convert
  { href: "/tools/excel-to-csv", name: "Excel to CSV converter", short: "Excel to CSV", group: "Convert", popular: true, icon: FileSpreadsheet,
    desc: "Save any sheet of an .xlsx workbook as a CSV, or every sheet at once.",
    recipe: "a workbook opens as it is, sheet by sheet" },
  { href: "/tools/json-to-csv", name: "JSON to CSV converter", short: "JSON to CSV", group: "Convert", popular: true, icon: FileJson,
    desc: "Flatten a JSON array into a spreadsheet-ready CSV, nested keys included.",
    recipe: "a JSON file opens as it is" },
  { href: "/tools/csv-to-json", name: "CSV to JSON converter", short: "CSV to JSON", group: "Convert", icon: Braces,
    desc: "Turn a CSV into a JSON array, with numbers detected and dotted keys nested.",
    recipe: "a JSON export is one click" },
  { href: "/tools/csv-delimiter", name: "CSV delimiter converter", short: "Change delimiter", group: "Convert", icon: ArrowLeftRight,
    desc: "Switch between comma, semicolon, tab and pipe separated files.",
    recipe: "a file with any delimiter opens as it is" },
  { href: "/tools/csv-to-excel", name: "CSV to Excel converter", short: "CSV to Excel", group: "Convert", popular: true, icon: Sheet,
    desc: "Save a CSV as an .xlsx workbook, with numbers stored as numbers.",
    recipe: "an Excel export is one click" },
  { href: "/tools/csv-to-sql", name: "CSV to SQL converter", short: "CSV to SQL", group: "Convert", icon: Database,
    desc: "Write CREATE TABLE and INSERT statements for PostgreSQL, MySQL or SQLite.",
    recipe: "Chef writes the SQL for each step, and you can read it" },
  { href: "/tools/csv-to-markdown", name: "CSV to Markdown or HTML table", short: "CSV to Markdown", group: "Convert", icon: Table2,
    desc: "Turn a CSV into a Markdown table or an HTML table you can paste anywhere.",
    recipe: "a cleaned file exports in the format you need" },
];

/** Four tools to suggest from a tool page: its own group first, then others. */
export function relatedTools(href: string, count = 4): Tool[] {
  const self = TOOLS.find((t) => t.href === href);
  const others = TOOLS.filter((t) => t.href !== href);
  const same = others.filter((t) => t.group === self?.group);
  const rest = others.filter((t) => t.group !== self?.group && t.popular);
  return [...same, ...rest].slice(0, count);
}
