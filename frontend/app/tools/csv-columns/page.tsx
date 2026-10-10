import type { Metadata } from "next";
import ToolShell from "@/components/tools/ToolShell";
import { ColumnsTool } from "@/components/tools/NewTools";

export const metadata: Metadata = {
  title: "Remove or Reorder CSV Columns Online, Free (No Upload)",
  description: "Delete columns from a CSV and put the rest in the order you want, in your browser. Free, private, no signup, no upload.",
  alternates: { canonical: "/tools/csv-columns" },
};

export default function Page() {
  return (
    <ToolShell
      href="/tools/csv-columns"
      title={"Remove or reorder columns"}
      intro={"Keep only the columns you need, in the order you want them. Untick a column to drop it and move the rest up or down, then download the trimmed file."}
      steps={[
        "Choose your CSV file. Every column is listed, all kept to start with.",
        "Untick the columns to drop, and use the arrows to set the order of the rest.",
        "Download the new CSV with just those columns, in that order."
      ]}
      faq={[
        {
          "q": "Is my file uploaded anywhere?",
          "a": "No. The file is read and processed inside your browser. Nothing is sent to a server, stored or logged."
        },
        {
          "q": "Are the rows changed in any way?",
          "a": "No. Every row is kept, and each kept cell is copied exactly as it was."
        },
        {
          "q": "Can I remove columns from a very wide file?",
          "a": "Yes. Use Keep none, then tick only the few columns you need."
        },
        {
          "q": "Can I do this to the same export every month?",
          "a": "In SheetsLLM, dropping and renaming columns are one-click fixes that you can save in a recipe and replay on next month's file."
        }
      ]}
    >
      <ColumnsTool />
    </ToolShell>
  );
}
