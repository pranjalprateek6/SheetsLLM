import type { Metadata } from "next";
import ToolShell from "@/components/tools/ToolShell";
import { CaseTool } from "@/components/tools/NewTools";

export const metadata: Metadata = {
  title: "Change Text Case in CSV: Title, Upper, Lower (Free, No Upload)",
  description: "Change the text case of CSV columns to Title Case, UPPERCASE, lowercase or Sentence case in your browser. Free, private, no signup.",
  alternates: { canonical: "/tools/change-case" },
};

export default function Page() {
  return (
    <ToolShell
      href="/tools/change-case"
      title={"Change text case"}
      intro={"Make names, cities and labels consistent: Title Case, UPPERCASE, lowercase or Sentence case, in just the columns you pick. A preview shows the change on a real value first."}
      steps={[
        "Choose your CSV file. It is parsed locally in your browser.",
        "Pick the columns to change and the case you want; a live example shows the result.",
        "Download the CSV with those columns changed and everything else untouched."
      ]}
      faq={[
        {
          "q": "Is my file uploaded anywhere?",
          "a": "No. The file is read and processed inside your browser. Nothing is sent to a server, stored or logged."
        },
        {
          "q": "How does Title Case handle hyphens?",
          "a": "Each part of a hyphenated word is capitalised, so mary-jane becomes Mary-Jane."
        },
        {
          "q": "Does it work with accented letters?",
          "a": "Yes. Letters in any alphabet are recognised, so élise becomes Élise."
        },
        {
          "q": "Will numbers or codes change?",
          "a": "Only letters change case. Pick just the text columns to leave codes and IDs exactly as they are."
        }
      ]}
    >
      <CaseTool />
    </ToolShell>
  );
}
