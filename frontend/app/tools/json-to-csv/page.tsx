import type { Metadata } from "next";
import ToolShell from "@/components/tools/ToolShell";
import JsonToCsvTool from "@/components/tools/JsonToCsvTool";

export const metadata: Metadata = {
  title: "Free JSON to CSV Converter: Online, Private, No Upload",
  description:
    "Convert JSON arrays to CSV in your browser. Nested objects flatten to dot-path columns. Free, no signup, no upload. Paste JSON or choose a file and download the CSV.",
  alternates: { canonical: "/tools/json-to-csv" },
};

export default function Page() {
  return (
    <ToolShell
      title="JSON to CSV converter"
      intro="Turn a JSON array of objects into a spreadsheet-ready CSV. Nested objects become dot-path columns; arrays are preserved as JSON strings."
      steps={[
        "Paste your JSON or upload a .json file: an array of objects, or an object that contains one.",
        "The converter flattens nested objects into columns like customer.name and unions the keys across all records.",
        "Download the CSV and open it in Excel, Google Sheets, or anything else.",
      ]}
      faq={[
        {
          q: "Is my JSON sent anywhere?",
          a: "No. Conversion runs entirely in your browser. Nothing is uploaded, stored, or logged.",
        },
        {
          q: "What JSON shapes are supported?",
          a: "A top-level array of objects works best. A single object becomes one row, and a wrapper object like {\"items\": [...]} is unwrapped automatically.",
        },
        {
          q: "How is nesting handled?",
          a: "Nested objects flatten to dot-path column names (address.city). Arrays inside a record are kept as JSON strings so no data is lost.",
        },
        {
          q: "What happens when records have different keys?",
          a: "The column set is the union of all keys across records; missing values are left empty.",
        },
      ]}
    >
      <JsonToCsvTool />
    </ToolShell>
  );
}
