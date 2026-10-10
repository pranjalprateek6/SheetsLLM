import type { Metadata } from "next";
import ToolShell from "@/components/tools/ToolShell";
import { ExcelToCsvTool } from "@/components/tools/NewTools";

export const metadata: Metadata = {
  title: "Free Excel to CSV Converter: XLSX to CSV Online (No Upload)",
  description: "Convert an Excel workbook (.xlsx) to CSV in your browser: one sheet or every sheet at once, with dates written as ISO dates. Free, private, no signup, no upload.",
  alternates: { canonical: "/tools/excel-to-csv" },
};

export default function Page() {
  return (
    <ToolShell
      href="/tools/excel-to-csv"
      title={"Excel to CSV converter"}
      intro={"Save any sheet of an .xlsx workbook as a CSV, or every sheet at once. Dates are written as ISO dates (2026-10-03), so they read the same everywhere."}
      steps={[
        "Choose an .xlsx workbook. Its sheets are listed with their row counts.",
        "Pick a sheet, or download them all; each becomes its own CSV.",
        "Open the CSV anywhere: the first row of the sheet is the header."
      ]}
      faq={[
        {
          "q": "Is my file uploaded anywhere?",
          "a": "No. The file is read and processed inside your browser. Nothing is sent to a server, stored or logged."
        },
        {
          "q": "Does it read old .xls files?",
          "a": "It reads .xlsx, the format Excel has used since 2007. Open an old .xls file in Excel and save it as .xlsx first."
        },
        {
          "q": "What happens to formulas?",
          "a": "The CSV holds each cell's value as Excel last calculated it. Formulas themselves are not kept, since CSV has no way to store them."
        },
        {
          "q": "How are dates written?",
          "a": "As ISO dates, like 2026-10-03, or with a time when the cell has one. That format sorts correctly and every tool reads it."
        }
      ]}
    >
      <ExcelToCsvTool />
    </ToolShell>
  );
}
