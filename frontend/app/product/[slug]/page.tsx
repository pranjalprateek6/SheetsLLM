import type { Metadata } from "next";
import { notFound } from "next/navigation";

import ProductPageView from "@/components/marketing/ProductPageView";
import { PRODUCT_PAGES, productPage } from "@/components/marketing/product-pages";

export function generateStaticParams() {
  return PRODUCT_PAGES.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const page = productPage(params.slug);
  if (!page) return {};
  return {
    title: `${page.headline} | SheetsLLM`,
    description: page.lead,
    alternates: { canonical: page.href },
  };
}

export default function ProductPage({ params }: { params: { slug: string } }) {
  const page = productPage(params.slug);
  if (!page) notFound();
  return <ProductPageView page={page} />;
}
