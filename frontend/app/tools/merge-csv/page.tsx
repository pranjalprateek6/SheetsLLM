import type { Metadata } from "next";
import ToolShell from "@/components/tools/ToolShell";
import { MergeTool } from "@/components/tools/NewTools";

export const metadata: Metadata = {
  title: "Free CSV Merger: Combine CSV Files Online (No Upload)",
  description: "Merge several CSV files into one in your browser. Columns line up by name, even when files differ, with an optional column naming each row's source file. Free and private.",
  alternates: { canonical: "/tools/merge-csv" },
};

export default function Page() {
  return (
    <ToolShell
      href="/tools/merge-csv"
      title={"Merge CSV files"}
      intro={"Stack two or more CSV files into one. Columns line up by name, so files with different column orders still merge cleanly, and a Source file column can say where each row came from."}
      steps={[
        "Choose two or more CSV files, or drop them in together. Add more at any time.",
        "Keep the Source file column on to record which file each row came from.",
        "Download merged.csv. A file that lacks a column leaves those cells empty."
      ]}
      faq={[
        {
          "q": "Is my file uploaded anywhere?",
          "a": "No. The file is read and processed inside your browser. Nothing is sent to a server, stored or logged."
        },
        {
          "q": "What if the files have different columns?",
          "a": "Columns are matched by header name. The merged file has every column any file had, in the order they first appear, and a row from a file without a column leaves that cell empty."
        },
        {
          "q": "Does the order of the columns in each file matter?",
          "a": "No. A file with Region before Amount merges correctly with one that has Amount before Region."
        },
        {
          "q": "How many files can I merge?",
          "a": "As many as your browser's memory allows; dozens of everyday exports are fine. For a merge you repeat every month, SheetsLLM can save the cleanup that follows as a recipe."
        }
      ]}
    >
      <MergeTool />
    </ToolShell>
  );
}
