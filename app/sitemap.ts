import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// Карта сайта — только публичные страницы. Дата берётся на момент сборки:
// сайт пересобирается при каждом деплое, значит дата честно отражает
// последнее изменение содержимого.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/register`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/legal/offer`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/legal/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
