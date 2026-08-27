import type { Metadata } from "next";
import "./globals.css";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, OG_IMAGE } from "@/lib/seo";

export const metadata: Metadata = {
  // metadataBase обязателен: без него Next не может превратить относительные
  // пути картинок и canonical в абсолютные, а поисковику нужны абсолютные.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "ТоргОС — программа для магазина и кафе: касса, учёт товаров и себестоимости",
    // Внутренние страницы дописывают своё название к бренду.
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "программа для магазина",
    "учёт товаров в магазине",
    "программа складского учёта",
    "касса для магазина",
    "касса для кафе",
    "учёт остатков",
    "себестоимость и наценка",
    "автоматизация магазина у дома",
    "учёт для пекарни",
    "учёт для кофейни",
    "товароучётная система",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "ТоргОС — касса и учёт для небольшого магазина или кафе",
    description: SITE_DESCRIPTION,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "Касса ТоргОС с открытым чеком" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ТоргОС — касса и учёт для небольшого магазина или кафе",
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  icons: { icon: "/favicon.ico", apple: "/logo_torgos.png" },
  category: "business",
  // Коды подтверждения прав на сайт. Без них не открыть Яндекс.Вебмастер и
  // Search Console — а без них не увидеть, по каким запросам сайт находят и
  // какие страницы поисковик не смог обойти. Пусто = мета-тег не выводится.
  verification: {
    yandex: process.env.NEXT_PUBLIC_YANDEX_VERIFICATION || undefined,
    google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION || undefined,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className="h-full">
      <body className="min-h-full flex flex-col bg-paper text-ink antialiased">{children}</body>
    </html>
  );
}
