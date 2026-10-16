import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Try it on a messy export, no sign-up | SheetsLLM",
  description:
    "Fix a month of messy order exports in a few clicks, then run the same steps on next month's file. The real engine, no account, no AI calls.",
  alternates: { canonical: "/try" },
};

export default function TryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
