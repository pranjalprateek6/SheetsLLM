import type { Metadata } from "next";
import { notFound } from "next/navigation";

import LegalPage from "@/components/marketing/LegalPage";
import { LEGAL_DOCS, legalDoc } from "@/components/marketing/legal";

export function generateStaticParams() {
  return LEGAL_DOCS.map((d) => ({ slug: d.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const doc = legalDoc(params.slug);
  if (!doc) return {};
  return {
    title: `${doc.title} | SheetsLLM`,
    description: doc.summary,
    alternates: { canonical: doc.href },
  };
}

export default function Page({ params }: { params: { slug: string } }) {
  const doc = legalDoc(params.slug);
  if (!doc) notFound();
  return <LegalPage doc={doc} />;
}
