import type { Metadata } from "next";
import ToolShell from "@/components/tools/ToolShell";
import { CsvToTableTool } from "@/components/tools/MoreTools";

export const metadata: Metadata = {
  title: "CSV to Markdown Table or HTML Table Converter (Free)",
  description: "Convert a CSV into a Markdown table or an HTML table to paste into docs, README files, wikis and emails. Free, in your browser, no signup.",
  alternates: { canonical: "/tools/csv-to-markdown" },
};

export default function Page() {
  return (
    <ToolShell
      href="/tools/csv-to-markdown"
      title={"CSV to Markdown or HTML table"}
      intro={"Turn a CSV into a table you can paste anywhere: a Markdown table for README files, wikis and chats, or an HTML table for web pages and emails. Number columns are right-aligned in Markdown."}
      steps={[
  "Choose your CSV file. It is read locally in your browser.",
  "Pick Markdown or HTML.",
  "Copy the table or download it."
]}
      faq={[
  {
    "q": "Is my file uploaded anywhere?",
    "a": "No. The file is read and processed inside your browser. Nothing is sent to a server, stored or logged."
  },
  {
    "q": "Are special characters escaped?",
    "a": "Yes. Pipes are escaped in Markdown, and every value is escaped in HTML."
  },
  {
    "q": "What about line breaks inside a cell?",
    "a": "In Markdown they become <br> so the table stays on one line per row."
  },
  {
    "q": "Is the HTML styled?",
    "a": "No. It is a plain table with a header, ready for your own styles."
  }
]}
    >
      <CsvToTableTool />
    </ToolShell>
  );
}
