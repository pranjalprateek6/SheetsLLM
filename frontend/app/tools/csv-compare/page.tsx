import type { Metadata } from "next";
import ToolShell from "@/components/tools/ToolShell";
import { CompareTool } from "@/components/tools/MoreTools";

export const metadata: Metadata = {
  title: "Compare Two CSV Files: Added, Removed and Changed Rows (Free)",
  description: "Compare two CSV files in your browser and see which rows were added, removed or changed, matched on an ID column. Free, private, no signup.",
  alternates: { canonical: "/tools/csv-compare" },
};

export default function Page() {
  return (
    <ToolShell
      href="/tools/csv-compare"
      title={"Compare two CSV files"}
      intro={"Put last month's export next to this month's and see what moved: rows added, rows removed, and, matched on an ID, exactly which cells changed. Columns line up by name."}
      steps={[
  "Choose the older file, then the newer one. Both are read locally.",
  "Pick a column that identifies a row, like an order ID, or compare whole rows.",
  "Read the counts and the changed cells, and download the differences as a CSV."
]}
      faq={[
  {
    "q": "Is my file uploaded anywhere?",
    "a": "No. The file is read and processed inside your browser. Nothing is sent to a server, stored or logged."
  },
  {
    "q": "What if the columns are in a different order?",
    "a": "Columns are matched by name, so order does not matter. Columns that are only in one file are listed separately."
  },
  {
    "q": "What does matching on a column do?",
    "a": "Rows with the same value in that column are treated as the same row, so a change to one cell shows as a changed cell instead of a removed row and an added one."
  },
  {
    "q": "What if an ID appears twice?",
    "a": "The tool says so, and compares the first row with that ID."
  }
]}
    >
      <CompareTool />
    </ToolShell>
  );
}
