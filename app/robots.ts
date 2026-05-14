import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/account/", "/audit/", "/onboard/", "/api/"],
    },
    sitemap: "https://label.watch/sitemap.xml",
  };
}
