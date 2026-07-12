import type { Metadata } from "next";
import ToolShell from "@/components/tools/ToolShell";
import CleanTool from "@/components/tools/CleanTool";

export const metadata: Metadata = {
  title: "Free CSV Cleaner: Trim Whitespace & Remove Empty Rows Online",
  description:
    "Clean a messy CSV in your browser: trim whitespace, remove empty rows and columns, collapse double spaces. Free, private, no signup. The file never leaves your computer.",
  alternates: { canonical: "/tools/csv-cleaner" },
};

export default function Page() {
  return (
    <ToolShell
      title="CSV cleaner"
      intro="One-click hygiene for messy exports: trim stray whitespace, drop fully empty rows and columns, and collapse repeated spaces, then download the cleaned file."
      steps={[
        "Choose your CSV file. It's parsed locally in your browser.",
        "Pick the cleanups to apply. Whitespace trimming and empty-row/column removal are on by default.",
        "Download the cleaned CSV and see exactly how many cells, rows, and columns were touched.",
      ]}
      faq={[
        {
          q: "Is my data uploaded to a server?",
          a: "No. All cleaning runs in your browser with JavaScript. Nothing is transmitted or stored.",
        },
        {
          q: "What counts as an empty row or column?",
          a: "A row where every cell is blank after trimming, or a column with a blank header and no values in any row.",
        },
        {
          q: "Will it change my actual values?",
          a: "Only in the ways you tick: trimming removes leading/trailing spaces, and the optional collapse turns runs of spaces inside a cell into one. Nothing else is modified.",
        },
        {
          q: "What about smarter cleanups like dates, casing, and categories?",
          a: "That's what the SheetsLLM app is for: describe the cleanup in plain English ('standardize the dates, title-case the names'), preview it, and save it as a repeatable recipe.",
        },
      ]}
    >
      <CleanTool />
    </ToolShell>
  );
}
