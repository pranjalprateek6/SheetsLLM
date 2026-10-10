import type { Metadata } from "next";
import ToolShell from "@/components/tools/ToolShell";
import { SplitColumnTool } from "@/components/tools/NewTools";

export const metadata: Metadata = {
  title: "Split a CSV Column into Multiple Columns, Free (No Upload)",
  description: "Split one CSV column into two or more on a space, comma, hyphen or any separator, like Full name into First and Last. Runs in your browser. Free and private.",
  alternates: { canonical: "/tools/split-column" },
};

export default function Page() {
  return (
    <ToolShell
      href="/tools/split-column"
      title={"Split a column"}
      intro={"Turn one column into two or more on a separator: Full name into First and Last, or a date like 2026-10-03 into its parts. A preview shows the split before you download."}
      steps={[
        "Choose your CSV file and the column to split.",
        "Pick the separator, and whether to split into two named columns or as many as the cells need.",
        "Download the CSV with the new columns in place of the old one, or beside it."
      ]}
      faq={[
        {
          "q": "Is my file uploaded anywhere?",
          "a": "No. The file is read and processed inside your browser. Nothing is sent to a server, stored or logged."
        },
        {
          "q": "What happens to names with a middle name?",
          "a": "Split into two columns, the first part goes in the first column and everything after it in the second, so Grace Brewster Hopper becomes Grace and Brewster Hopper. Turn the two-column option off to give every part its own column."
        },
        {
          "q": "Can I keep the original column?",
          "a": "Yes. Turn on Keep the original column and the new columns are added right after it."
        },
        {
          "q": "Are spaces around the parts removed?",
          "a": "Yes. Each part is trimmed, so Ada , Lovelace splits cleanly on the comma."
        }
      ]}
    >
      <SplitColumnTool />
    </ToolShell>
  );
}
