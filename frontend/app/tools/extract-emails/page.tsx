import type { Metadata } from "next";
import ToolShell from "@/components/tools/ToolShell";
import { ExtractTool } from "@/components/tools/MoreTools";

export const metadata: Metadata = {
  title: "Extract Emails, Links and Phone Numbers from a CSV (Free)",
  description: "Pull every email address, URL or phone number out of a CSV file, once each, with how often it appears. Free, in your browser, no signup.",
  alternates: { canonical: "/tools/extract-emails" },
};

export default function Page() {
  return (
    <ToolShell
      href="/tools/extract-emails"
      title={"Extract emails, links and phone numbers"}
      intro={"Get a clean list of every email address, link or phone number buried in a CSV, even inside notes and comments. Each appears once, with how many times it was seen and the first row it was on."}
      steps={[
  "Choose your CSV file. It is read locally in your browser.",
  "Pick what to find, and optionally the columns to look in.",
  "Download the list as a CSV."
]}
      faq={[
  {
    "q": "Is my file uploaded anywhere?",
    "a": "No. The file is read and processed inside your browser. Nothing is sent to a server, stored or logged."
  },
  {
    "q": "Are duplicates removed?",
    "a": "Yes. Emails are compared without case, and phone numbers by their digits, so each appears once with a count."
  },
  {
    "q": "Which phone numbers are found?",
    "a": "Runs of 8 to 15 digits with the usual spaces, dashes, dots and brackets. A leading + is kept."
  },
  {
    "q": "Can it check that an email works?",
    "a": "No. It finds text shaped like an address; it does not send anything."
  }
]}
    >
      <ExtractTool />
    </ToolShell>
  );
}
