import type { Metadata } from "next";
import ToolShell from "@/components/tools/ToolShell";
import { SortTool } from "@/components/tools/MoreTools";

export const metadata: Metadata = {
  title: "Sort a CSV File by One or More Columns (Free, No Upload)",
  description: "Sort a CSV by one or more columns, ascending or descending, with numbers sorted as numbers and empty cells last. Free, private, no signup.",
  alternates: { canonical: "/tools/sort-csv" },
};

export default function Page() {
  return (
    <ToolShell
      href="/tools/sort-csv"
      title={"Sort a CSV"}
      intro={"Sort a whole file by one column or several, each ascending or descending. Numbers sort as numbers, even with commas or a currency sign, text sorts in natural order, and empty cells always go last."}
      steps={[
  "Choose your CSV file. It is read locally in your browser.",
  "Click the columns to sort by, in order; click again to switch direction.",
  "Download the sorted CSV."
]}
      faq={[
  {
    "q": "Is my file uploaded anywhere?",
    "a": "No. The file is read and processed inside your browser. Nothing is sent to a server, stored or logged."
  },
  {
    "q": "Why does Item 10 come after Item 2?",
    "a": "Text sorts in natural order, the way a person reads it, rather than character by character."
  },
  {
    "q": "What happens to rows that tie?",
    "a": "They keep the order they had in the file."
  },
  {
    "q": "Does the header row move?",
    "a": "No. The header stays at the top."
  }
]}
    >
      <SortTool />
    </ToolShell>
  );
}
