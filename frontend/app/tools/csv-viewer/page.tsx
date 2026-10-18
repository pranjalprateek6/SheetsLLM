import type { Metadata } from "next";
import ToolShell from "@/components/tools/ToolShell";
import { CsvViewerTool } from "@/components/tools/MoreTools";

export const metadata: Metadata = {
  title: "CSV Viewer Online: Open Large CSV Files (Free, No Upload)",
  description: "Open a large CSV file as a grid you can scroll, sort and filter in your browser. Free, private, no signup, nothing uploaded.",
  alternates: { canonical: "/tools/csv-viewer" },
};

export default function Page() {
  return (
    <ToolShell
      href="/tools/csv-viewer"
      title={"CSV viewer"}
      intro={"Open a CSV too big or too awkward for a spreadsheet and look through it: scroll every row, sort by any column and filter what you see. The file stays on your machine."}
      steps={[
  "Choose your CSV file. It is parsed locally in your browser.",
  "Scroll the grid; click a column name to sort, or type in the filter bar under it.",
  "When it needs fixing, open it in SheetsLLM and keep every step."
]}
      faq={[
  {
    "q": "Is my file uploaded anywhere?",
    "a": "No. The file is read and processed inside your browser. Nothing is sent to a server, stored or logged."
  },
  {
    "q": "How big a file can it open?",
    "a": "Files of a few hundred thousand rows open well on most laptops. Above 50 MB the page warns first, because the whole file is held in this tab's memory."
  },
  {
    "q": "Can I edit cells?",
    "a": "This tool is for looking. To change a file and keep the changes as steps you can replay, open it in the app."
  },
  {
    "q": "Does it change my file?",
    "a": "No. Sorting and filtering only change what you see."
  }
]}
    >
      <CsvViewerTool />
    </ToolShell>
  );
}
