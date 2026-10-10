import type { Metadata } from "next";
import { Container, Prefooter, SiteFooter } from "@/components/marketing/blocks";
import { BrowserOnly, ToolRow } from "@/components/tools/ToolShell";

export const metadata: Metadata = {
  title: "Free CSV & JSON Tools: Private, In-Browser, No Signup",
  description:
    "Free online tools for spreadsheet files: CSV duplicate remover, JSON to CSV converter, CSV splitter for Excel's row limit, and CSV cleaner. Everything runs in your browser.",
  alternates: { canonical: "/tools" },
};

export default function ToolsIndex() {
  return (
    <div className="overflow-x-clip">
      <section>
        <Container className="pb-14 pt-16 sm:pb-16 sm:pt-24">
          <div className="grid gap-6 md:grid-cols-2 md:items-end md:gap-12">
            <h1 className="text-[40px] font-medium leading-none tracking-[-0.022em] sm:text-[56px]">
              Free CSV &amp; JSON tools
            </h1>
            <div className="max-w-[560px]">
              <p className="text-[17px] leading-relaxed text-soft">
                Quick fixes for messy data files: clean, dedupe, split and convert. No signup, and nothing is
                uploaded anywhere.
              </p>
              <BrowserOnly className="mt-4" />
            </div>
          </div>
        </Container>
      </section>
      <section>
        <Container className="pb-20 sm:pb-28">
          <ToolRow />
        </Container>
      </section>
      <Prefooter />
      <SiteFooter />
    </div>
  );
}
