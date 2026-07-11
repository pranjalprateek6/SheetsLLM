import type { Metadata } from "next";
import ToolShell from "@/components/tools/ToolShell";
import SplitTool from "@/components/tools/SplitTool";

export const metadata: Metadata = {
  title: "Free CSV Splitter — Split Large CSV Files for Excel (No Upload)",
  description:
    "Split a large CSV into smaller files in your browser — each part keeps the header row. Beat Excel's 1,048,576-row limit. Free, private, no signup, no upload.",
  alternates: { canonical: "/tools/csv-splitter" },
};

export default function Page() {
  return (
    <ToolShell
      title="CSV splitter"
      intro="Break a large CSV into smaller numbered files — each with the original header row — so they open cleanly in Excel and other tools."
      steps={[
        "Choose your CSV file. It's parsed locally; nothing is uploaded.",
        "Set the maximum rows per file. The default stays under Excel's 1,048,576-row sheet limit.",
        "Download the parts — name_part1of3.csv, name_part2of3.csv, and so on, each with the header.",
      ]}
      faq={[
        {
          q: "Why won't my CSV open fully in Excel?",
          a: "Excel caps a worksheet at 1,048,576 rows and silently truncates anything longer. Splitting the file into parts under the limit is the standard workaround.",
        },
        {
          q: "Does every part keep the header?",
          a: "Yes — the header row from the original file is repeated at the top of every part so each file stands alone.",
        },
        {
          q: "Is my file uploaded anywhere?",
          a: "No. Reading and splitting happen entirely in your browser; the parts are generated and downloaded locally.",
        },
        {
          q: "My browser asked to allow multiple downloads — why?",
          a: "Each part downloads as its own file, so the browser asks once for permission to save several files. That's expected.",
        },
      ]}
    >
      <SplitTool />
    </ToolShell>
  );
}
