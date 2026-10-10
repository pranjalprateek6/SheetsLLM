import type { MetadataRoute } from "next";

import { PRODUCT_PAGES } from "@/components/marketing/product-pages";
import { TOOLS } from "@/components/tools/catalog";

const BASE = "https://sheets-llm.vercel.app";

// Built from the same lists the pages are, so a new tool or product page is
// in the sitemap the moment it exists
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, changeFrequency: "weekly", priority: 1 },
    ...PRODUCT_PAGES.map((p) => ({ url: `${BASE}${p.href}`, changeFrequency: "monthly" as const, priority: 0.8 })),
    { url: `${BASE}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/tools`, changeFrequency: "monthly", priority: 0.9 },
    ...TOOLS.map((t) => ({ url: `${BASE}${t.href}`, changeFrequency: "monthly" as const, priority: 0.9 })),
  ];
}
