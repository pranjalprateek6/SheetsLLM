import { Copy, FileJson, Scissors, Sparkles, type LucideIcon } from "lucide-react";

/* The free tools, in one place: the index, each tool page's "More free
   tools" row, and the footer all read this list. */

export type Tool = { href: string; name: string; short: string; desc: string; icon: LucideIcon };

export const TOOLS: Tool[] = [
  {
    href: "/tools/csv-cleaner",
    name: "CSV cleaner",
    short: "CSV cleaner",
    desc: "Trim whitespace, drop empty rows and columns, collapse double spaces.",
    icon: Sparkles,
  },
  {
    href: "/tools/csv-deduplicate",
    name: "CSV duplicate remover",
    short: "Remove duplicates",
    desc: "Delete duplicate rows, matching on the whole row or the columns you pick.",
    icon: Copy,
  },
  {
    href: "/tools/csv-splitter",
    name: "CSV splitter",
    short: "Split a CSV",
    desc: "Cut a huge CSV into Excel-safe parts, each keeping the header row.",
    icon: Scissors,
  },
  {
    href: "/tools/json-to-csv",
    name: "JSON to CSV converter",
    short: "JSON to CSV",
    desc: "Flatten a JSON array into a spreadsheet-ready CSV, nested keys included.",
    icon: FileJson,
  },
];
