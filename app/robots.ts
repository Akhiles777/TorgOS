import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// robots.txt не существовало вовсе: поисковик обходил и кассу, и админку, и
// api — тратил на них краулинговый бюджет, а в выдачу могли попасть страницы
// логина. Публична только витрина и юридические документы.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/pos", "/owner", "/root", "/api", "/login", "/logout", "/billing", "/verify-email", "/impersonate"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
