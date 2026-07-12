import type { Metadata } from "next";
import ToolShell from "@/components/tools/ToolShell";
import DedupeTool from "@/components/tools/DedupeTool";

export const metadata: Metadata = {
  title: "Free CSV Duplicate Remover: Deduplicate CSV Online (No Upload)",
  description:
    "Remove duplicate rows from a CSV file in your browser. Match on the whole row or specific columns. Free, private, no signup. Your file never leaves your computer.",
  alternates: { canonical: "/tools/csv-deduplicate" },
};

export default function Page() {
  return (
    <ToolShell
      title="CSV duplicate remover"
      intro="Delete duplicate rows from any CSV file. Match on the entire row or just the columns you choose, then download the cleaned file."
      steps={[
        "Choose your CSV file. It's parsed locally in your browser, never uploaded.",
        "Optionally pick the columns that define a duplicate (like email or order ID). No selection means the whole row must match.",
        "Download the deduplicated CSV. The first occurrence of each duplicate is kept.",
      ]}
      faq={[
        {
          q: "Is my data uploaded to a server?",
          a: "No. The file is read and processed entirely inside your browser with JavaScript. Nothing is transmitted, stored, or logged.",
        },
        {
          q: "Which duplicate is kept?",
          a: "The first occurrence in file order is kept; later matches are removed. Sort your file first if you need a different survivor.",
        },
        {
          q: "How large a file can it handle?",
          a: "Comfortably tens of megabytes / a few hundred thousand rows, depending on your machine. For bigger files or repeated cleanups, the SheetsLLM app handles up to a million rows.",
        },
        {
          q: "Does it handle quoted fields and commas inside values?",
          a: "Yes. Parsing follows the CSV standard (RFC 4180), so quoted fields, embedded commas, and line breaks inside cells are handled correctly.",
        },
      ]}
    >
      <DedupeTool />
    </ToolShell>
  );
}
