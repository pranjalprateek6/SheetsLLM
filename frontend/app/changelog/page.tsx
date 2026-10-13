import type { Metadata } from "next";

import ReadPage from "@/components/marketing/ReadPage";
import { CHANGELOG } from "@/components/marketing/changelog";

export const metadata: Metadata = {
  title: "What's new | SheetsLLM",
  description: "What changed in SheetsLLM, by day, in plain words.",
  alternates: { canonical: "/changelog" },
};

function dateLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export default function ChangelogPage() {
  return (
    <ReadPage
      label="Changelog"
      title="What's new"
      summary="What changed, by day, in the product's words."
      sections={CHANGELOG.map((e) => ({ id: e.date, title: e.title, intro: dateLabel(e.date), items: e.items }))}
      nav={[
        { href: "/help", name: "Help" },
        { href: "/changelog", name: "What's new", current: true },
      ]}
    />
  );
}
