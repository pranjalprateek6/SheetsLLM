import type { Metadata } from "next";
import ToolShell from "@/components/tools/ToolShell";
import { CsvToJsonTool } from "@/components/tools/NewTools";

export const metadata: Metadata = {
  title: "Free CSV to JSON Converter: Convert CSV Online (No Upload)",
  description: "Convert a CSV file to a JSON array in your browser. Numbers and true/false are detected, IDs with leading zeros stay text, and dotted headers can nest. Free, private, no signup.",
  alternates: { canonical: "/tools/csv-to-json" },
};

export default function Page() {
  return (
    <ToolShell
      href="/tools/csv-to-json"
      title={"CSV to JSON converter"}
      intro={"Turn a CSV into a JSON array of objects, one per row. Numbers and true/false are detected for you, IDs with leading zeros stay text, and headers like address.city can become nested objects."}
      steps={[
        "Choose your CSV file. It is parsed locally in your browser.",
        "Pick the options: detect numbers, nest dotted headers, indent the output. The first record previews live.",
        "Download the .json file, named after your CSV."
      ]}
      faq={[
        {
          "q": "Is my file uploaded anywhere?",
          "a": "No. The file is read and processed inside your browser. Nothing is sent to a server, stored or logged."
        },
        {
          "q": "Why do some numbers stay as text?",
          "a": "Values with leading zeros (like 007 or zip codes) or thousands separators (1,200) are kept as text, because turning them into numbers would change them. Turn detection off to keep every value as text."
        },
        {
          "q": "What does nesting dotted headers do?",
          "a": "A header such as address.city becomes {\"address\": {\"city\": ...}}, which is the shape most APIs expect. Leave it off for flat keys."
        },
        {
          "q": "What happens to empty cells?",
          "a": "With detection on, an empty cell becomes null. With it off, it is an empty string."
        }
      ]}
    >
      <CsvToJsonTool />
    </ToolShell>
  );
}
