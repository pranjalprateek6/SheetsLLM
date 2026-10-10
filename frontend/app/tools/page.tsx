import type { Metadata } from "next";
import { Container, Prefooter, SiteFooter } from "@/components/marketing/blocks";
import { BrowserOnly, ToolRow } from "@/components/tools/ToolShell";
import { GROUPS, TOOLS } from "@/components/tools/catalog";

export const metadata: Metadata = {
  title: "Free CSV, Excel & JSON Tools: Private, In-Browser, No Signup",
  description:
    "Twelve free tools for spreadsheet files: clean, dedupe, find and replace, merge, split, reorder columns, and convert between CSV, Excel, JSON and delimiters. Everything runs in your browser.",
  alternates: { canonical: "/tools" },
};

export default function ToolsIndex() {
  return (
    <div className="overflow-x-clip">
      <section>
        <Container className="pb-14 pt-16 sm:pb-16 sm:pt-24">
          <div className="grid gap-6 md:grid-cols-2 md:items-end md:gap-12">
            <h1 className="text-[40px] font-medium leading-none tracking-[-0.022em] sm:text-[56px]">
              Free CSV, Excel &amp; JSON tools
            </h1>
            <div className="max-w-[560px]">
              <p className="text-[17px] leading-relaxed text-soft">
                Twelve quick fixes for messy data files: clean, reshape and convert. No signup, and nothing
                is uploaded anywhere.
              </p>
              <BrowserOnly className="mt-4" />
            </div>
          </div>
        </Container>
      </section>
      {GROUPS.map((g) => (
        <section key={g.name}>
          <Container className="pb-14 sm:pb-16">
            <div className="mb-4 flex items-baseline gap-3">
              <h2 className="text-[17px] font-medium">{g.name}</h2>
              <p className="text-[14px] text-muted-foreground">{g.blurb}</p>
            </div>
            <ToolRow tools={TOOLS.filter((t) => t.group === g.name)} />
          </Container>
        </section>
      ))}
      <div className="pb-6 sm:pb-12" />
      <Prefooter />
      <SiteFooter />
    </div>
  );
}
