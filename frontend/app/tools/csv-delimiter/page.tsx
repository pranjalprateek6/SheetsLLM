import type { Metadata } from "next";
import ToolShell from "@/components/tools/ToolShell";
import { DelimiterTool } from "@/components/tools/NewTools";

export const metadata: Metadata = {
  title: "CSV Delimiter Converter: Semicolon, Tab, Pipe to Comma (Free)",
  description: "Convert CSV files between comma, semicolon, tab and pipe delimiters in your browser. The current separator is detected for you. Free, private, no upload.",
  alternates: { canonical: "/tools/csv-delimiter" },
};

export default function Page() {
  return (
    <ToolShell
      href="/tools/csv-delimiter"
      title={"CSV delimiter converter"}
      intro={"Switch a file between comma, semicolon, tab and pipe separators. The current separator is detected for you, so a semicolon export from a European Excel opens cleanly anywhere."}
      steps={[
        "Choose your file. Its separator is detected and shown.",
        "Pick the separator you need: comma, semicolon, tab or pipe.",
        "Download the converted file; a tab-separated file is saved as .tsv."
      ]}
      faq={[
        {
          "q": "Is my file uploaded anywhere?",
          "a": "No. The file is read and processed inside your browser. Nothing is sent to a server, stored or logged."
        },
        {
          "q": "Why does my CSV open in one column in Excel?",
          "a": "Excel uses your region's list separator. In many European locales that is a semicolon, so a comma file lands in one column, and the other way round. Converting to the separator Excel expects fixes it."
        },
        {
          "q": "Are commas inside values safe?",
          "a": "Yes. Values that contain the new separator, quotes or line breaks are quoted correctly in the output."
        },
        {
          "q": "Which file types can I open?",
          "a": ".csv, .tsv and .txt files separated by commas, semicolons, tabs or pipes."
        }
      ]}
    >
      <DelimiterTool />
    </ToolShell>
  );
}
