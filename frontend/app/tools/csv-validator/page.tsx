import type { Metadata } from "next";
import ToolShell from "@/components/tools/ToolShell";
import { ValidatorTool } from "@/components/tools/MoreTools";

export const metadata: Metadata = {
  title: "CSV Validator: Check a CSV for Errors, Blanks and Duplicates (Free)",
  description: "Check a CSV file for duplicate rows, empty cells, mixed values, stray spaces and repeated headers in your browser. Free, private, no signup.",
  alternates: { canonical: "/tools/csv-validator" },
};

export default function Page() {
  return (
    <ToolShell
      href="/tools/csv-validator"
      title={"CSV validator"}
      intro={"Find out what is wrong with a file before you rely on it: rows repeated exactly, empty rows and cells, columns that mix numbers with text, values with stray spaces, and headers that repeat or are missing."}
      steps={[
  "Choose your CSV file. It is checked locally in your browser.",
  "Read the findings, worst first, and the table of every column.",
  "Fix them by hand, or open the file in SheetsLLM where each finding has a one-click fix."
]}
      faq={[
  {
    "q": "Is my file uploaded anywhere?",
    "a": "No. The file is read and processed inside your browser. Nothing is sent to a server, stored or logged."
  },
  {
    "q": "What counts as a mixed column?",
    "a": "One where more than one in twenty filled cells are a different kind of value from the rest, such as text in a column of amounts."
  },
  {
    "q": "Does it check against a schema?",
    "a": "No. It reports what the file itself shows: shape, repeats, blanks and the kind of value in each column."
  },
  {
    "q": "Does it change my file?",
    "a": "No. It only reads it."
  }
]}
    >
      <ValidatorTool />
    </ToolShell>
  );
}
