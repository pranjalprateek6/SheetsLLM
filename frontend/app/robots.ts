import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/workspace", "/dashboard", "/account", "/auth"],
      },
    ],
    sitemap: "https://sheets-llm.vercel.app/sitemap.xml",
  };
}
