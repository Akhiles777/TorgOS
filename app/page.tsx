import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { homeFor } from "@/server/guard";
import { Landing } from "@/components/landing/Landing";
import { FAQ } from "@/components/landing/FaqSection";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, OG_IMAGE, PRICE_START, PRICE_PRO } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ТоргОС — программа для магазина и кафе: касса, учёт товаров и себестоимости",
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

// Структурированные данные. Дают поисковику понять, что это за сервис и
// сколько он стоит, а FAQ-разметка позволяет вопросам показываться прямо в
// выдаче раскрывающимся блоком. Все значения совпадают с видимым текстом
// страницы — иначе разметка считается недостоверной.
function structuredData() {
  const product = {
    "@type": "SoftwareApplication",
    "@id": `${SITE_URL}/#software`,
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    image: OG_IMAGE,
    inLanguage: "ru-RU",
    featureList: [
      "Касса со сканированием штрихкодов",
      "Учёт остатков и движений товара",
      "Себестоимость и наценка по каждой позиции",
      "Приёмка товара с распознаванием через ИИ",
      "Инвентаризация и списания",
      "Рецепты и калькуляция блюд для кафе",
      "Учёт долгов покупателей",
      "Импорт номенклатуры из Excel и CSV",
    ],
    offers: [
      {
        "@type": "Offer",
        name: "Старт",
        price: PRICE_START,
        priceCurrency: "RUB",
        description: "Одна торговая точка",
        url: `${SITE_URL}/register`,
      },
      {
        "@type": "Offer",
        name: "Профи",
        price: PRICE_PRO,
        priceCurrency: "RUB",
        description: "Несколько точек и расширенные возможности",
        url: `${SITE_URL}/register`,
      },
    ],
  };

  const organization = {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo_torgos.png`,
  };

  const website = {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE_NAME,
    inLanguage: "ru-RU",
    publisher: { "@id": `${SITE_URL}/#organization` },
  };

  const faq = {
    "@type": "FAQPage",
    "@id": `${SITE_URL}/#faq`,
    mainEntity: FAQ.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };

  return { "@context": "https://schema.org", "@graph": [organization, website, product, faq] };
}

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  return (
    <>
      <script
        type="application/ld+json"
        // Данные свои, не пользовательские; JSON.stringify экранирует кавычки,
        // а закрывающий тег внутри строк невозможен по составу данных.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()) }}
      />
      <Landing />
    </>
  );
}
