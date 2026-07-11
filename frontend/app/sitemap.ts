import type { MetadataRoute } from "next";

const BASE = "https://sheets-llm.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/tools`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/tools/csv-deduplicate`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/tools/json-to-csv`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/tools/csv-splitter`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/tools/csv-cleaner`, changeFrequency: "monthly", priority: 0.9 },
  ];
}
