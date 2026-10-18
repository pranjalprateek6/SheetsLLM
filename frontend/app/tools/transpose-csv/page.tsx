import type { Metadata } from "next";
import ToolShell from "@/components/tools/ToolShell";
import { TransposeTool } from "@/components/tools/MoreTools";

export const metadata: Metadata = {
  title: "Transpose a CSV: Swap Rows and Columns (Free, In Your Browser)",
  description: "Transpose a CSV file so rows become columns and columns become rows. Free, private, no signup, nothing uploaded.",
  alternates: { canonical: "/tools/transpose-csv" },
};

export default function Page() {
  return (
    <ToolShell
      href="/tools/transpose-csv"
      title={"Transpose a CSV"}
      intro={"Turn a wide table into a long one or the other way round: every row becomes a column and every column a row. The first column becomes the new header row."}
      steps={[
  "Choose your CSV file. It is read locally in your browser.",
  "Check the new shape shown under the file.",
  "Download the transposed CSV."
]}
      faq={[
  {
    "q": "Is my file uploaded anywhere?",
    "a": "No. The file is read and processed inside your browser. Nothing is sent to a server, stored or logged."
  },
  {
    "q": "What becomes the header?",
    "a": "The first column's values. The old header row becomes the first column."
  },
  {
    "q": "Is there a size limit?",
    "a": "Only your browser's memory. A file with very many rows makes a very wide result, which some spreadsheets cannot open."
  },
  {
    "q": "Are empty cells kept?",
    "a": "Yes. Every cell moves to its new place, empty or not."
  }
]}
    >
      <TransposeTool />
    </ToolShell>
  );
}
