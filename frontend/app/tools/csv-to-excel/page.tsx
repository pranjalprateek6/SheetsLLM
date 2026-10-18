import type { Metadata } from "next";
import ToolShell from "@/components/tools/ToolShell";
import { CsvToExcelTool } from "@/components/tools/MoreTools";

export const metadata: Metadata = {
  title: "CSV to Excel Converter: Save CSV as XLSX (Free, No Upload)",
  description: "Convert a CSV file to an Excel .xlsx workbook in your browser, with numbers stored as numbers and leading zeros kept. Free, private, no signup.",
  alternates: { canonical: "/tools/csv-to-excel" },
};

export default function Page() {
  return (
    <ToolShell
      href="/tools/csv-to-excel"
      title={"CSV to Excel converter"}
      intro={"Save a CSV as a real Excel workbook. Numbers are stored as numbers so formulas work, while codes with leading zeros, like 00123, stay exactly as they are."}
      steps={[
  "Choose your CSV file. It is read locally in your browser.",
  "Choose whether to store numbers as numbers.",
  "Download the .xlsx file."
]}
      faq={[
  {
    "q": "Is my file uploaded anywhere?",
    "a": "No. The file is read and processed inside your browser. Nothing is sent to a server, stored or logged."
  },
  {
    "q": "Will Excel drop my leading zeros?",
    "a": "No. A value with a leading zero is written as text, so 00123 stays 00123."
  },
  {
    "q": "How many rows can a sheet hold?",
    "a": "Excel opens up to 1,048,576 rows on one sheet. For more, split the CSV first."
  },
  {
    "q": "Are dates converted?",
    "a": "Dates are written as the text in your file, so nothing is reinterpreted by a different date format."
  }
]}
    >
      <CsvToExcelTool />
    </ToolShell>
  );
}
