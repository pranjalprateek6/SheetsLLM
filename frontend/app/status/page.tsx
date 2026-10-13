import type { Metadata } from "next";

import StatusPanel from "@/components/StatusPanel";
import { Container, SiteFooter } from "@/components/marketing/blocks";

export const metadata: Metadata = {
  title: "Status | SheetsLLM",
  description: "Whether the website, the server, the database and the AI model are answering right now.",
  alternates: { canonical: "/status" },
};

export default function StatusPage() {
  return (
    <div className="overflow-x-clip">
      <section className="border-b">
        <Container className="pb-12 pt-16 sm:pb-14 sm:pt-24">
          <p className="text-[13px] text-muted-foreground">Status</p>
          <h1 className="mt-3 max-w-[760px] text-[36px] font-medium leading-[1.05] tracking-[-0.022em] sm:text-[56px] sm:leading-none">
            Is it us?
          </h1>
          <p className="mt-6 max-w-[560px] text-[17px] leading-relaxed text-soft">
            The four things a request passes through, and whether each is answering right now. When Chef is quiet, this
            says whose fault it is.
          </p>
        </Container>
      </section>
      <section>
        <Container className="max-w-[760px] py-12 sm:py-16">
          <StatusPanel />
          <p className="mt-8 text-[13px] leading-relaxed text-muted-foreground">
            The AI model is Google&apos;s, reached through its API. When it is overloaded or out of capacity, your recipes,
            undo and every one-click fix keep working; only new messages to Chef wait.
          </p>
        </Container>
      </section>
      <SiteFooter />
    </div>
  );
}
