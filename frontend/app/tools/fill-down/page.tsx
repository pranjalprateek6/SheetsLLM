import type { Metadata } from "next";
import ToolShell from "@/components/tools/ToolShell";
import { FillDownTool } from "@/components/tools/MoreTools";

export const metadata: Metadata = {
  title: "Fill Down Blank Cells in a CSV (Free, In Your Browser)",
  description: "Fill empty cells in a CSV with the value from the row above, in the columns you choose. Free, private, no signup.",
  alternates: { canonical: "/tools/fill-down" },
};

export default function Page() {
  return (
    <ToolShell
      href="/tools/fill-down"
      title={"Fill down blank cells"}
      intro={"Reports often print a group's name once and leave the rows below it blank. Fill those blanks with the value above, in just the columns you pick, so every row stands on its own."}
      steps={[
  "Choose your CSV file. It is read locally in your browser.",
  "Pick the columns to fill.",
  "Download the CSV with the blanks filled and everything else untouched."
]}
      faq={[
  {
    "q": "Is my file uploaded anywhere?",
    "a": "No. The file is read and processed inside your browser. Nothing is sent to a server, stored or logged."
  },
  {
    "q": "What about blanks at the very top?",
    "a": "They stay empty, since there is nothing above them to copy."
  },
  {
    "q": "Does a cell with only spaces count as empty?",
    "a": "Yes. A cell with nothing but spaces is filled too."
  },
  {
    "q": "Can I fill with a fixed value instead?",
    "a": "Use find and replace for that, or fill empty cells as a one-click step in the app."
  }
]}
    >
      <FillDownTool />
    </ToolShell>
  );
}
