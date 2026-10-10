import type { Metadata } from "next";
import ToolShell from "@/components/tools/ToolShell";
import { FindReplaceTool } from "@/components/tools/NewTools";

export const metadata: Metadata = {
  title: "Find and Replace in CSV Files Online, Free (No Upload)",
  description: "Find and replace text across a CSV file or in chosen columns, with match case and whole-cell options. Runs in your browser. Free, private, no signup.",
  alternates: { canonical: "/tools/csv-find-replace" },
};

export default function Page() {
  return (
    <ToolShell
      href="/tools/csv-find-replace"
      title={"Find and replace"}
      intro={"Replace text across a whole CSV, or only in the columns you choose. Match the case or not, and replace inside cells or only cells whose whole value matches."}
      steps={[
        "Choose your CSV file. It is parsed locally in your browser.",
        "Type what to find and what to put instead; the button counts the cells that will change.",
        "Download the updated CSV."
      ]}
      faq={[
        {
          "q": "Is my file uploaded anywhere?",
          "a": "No. The file is read and processed inside your browser. Nothing is sent to a server, stored or logged."
        },
        {
          "q": "What does Whole cell only do?",
          "a": "It replaces a cell only when its entire value matches, so replacing N/A will not touch a cell that says N/A pending. Without it, matching text is replaced wherever it appears inside a cell."
        },
        {
          "q": "Are special characters treated literally?",
          "a": "Yes. Brackets, dots and dollar signs mean exactly themselves, in both the find and the replace text."
        },
        {
          "q": "Can I delete text instead of replacing it?",
          "a": "Yes. Leave Replace with empty and the matching text is removed."
        }
      ]}
    >
      <FindReplaceTool />
    </ToolShell>
  );
}
