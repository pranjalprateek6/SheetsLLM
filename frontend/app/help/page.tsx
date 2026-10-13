import type { Metadata } from "next";

import ReadPage from "@/components/marketing/ReadPage";
import { HELP_SECTIONS } from "@/components/marketing/help";

export const metadata: Metadata = {
  title: "Help | SheetsLLM",
  description: "What Chef can do, the one-click fixes, recipes, history, privacy, plans and shortcuts.",
  alternates: { canonical: "/help" },
};

export default function HelpPage() {
  return (
    <ReadPage
      label="Help"
      title="How SheetsLLM works"
      summary="What Chef can do, every one-click fix, how recipes run next month's file, and what leaves your file when."
      sections={HELP_SECTIONS}
      nav={[
        { href: "/help", name: "Help", current: true },
        { href: "/changelog", name: "What's new" },
      ]}
    />
  );
}
