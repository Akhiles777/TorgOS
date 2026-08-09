// Те же файлы шрифтов, что уже подключены для приложения — самохостинг,
// кириллица проверена при первой установке. Полные веса (не cyrillic-*):
// в поднаборах по unicode-range цифры лежат в latin, отдельный cyrillic-файл
// их не покрывает (этот баг уже один раз ловил на прошлой версии лендинга).
import "@fontsource-variable/unbounded/wght.css";
import "@fontsource-variable/golos-text/wght.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";

import Link from "next/link";
import { LandingHeader } from "./LandingHeader";
import { Hero } from "./Hero";
import { ProblemSection } from "./ProblemSection";
import { HowItWorksSection } from "./HowItWorksSection";
import { InventorySection } from "./InventorySection";
import { PricingSection } from "./PricingSection";
import { FaqSection } from "./FaqSection";
import { FinalCta } from "./FinalCta";
import { ScrollReveal } from "./ScrollReveal";

// v3: токены, шкалы и палитра — по спецификации заказчика буквально (см.
// отчёт по шагам). Фирменный элемент по-прежнему один — карточка в «Как это
// работает», остальная страница спокойная, широкая, заголовки по левому краю.
export function Landing() {
  return (
    <div className="min-h-dvh bg-land-paper font-landing-text">
      <ScrollReveal />
      <LandingHeader />
      <main>
        <Hero />
        <ProblemSection />
        <HowItWorksSection />
        <InventorySection />
        <PricingSection />
        <FaqSection />
        <FinalCta />
      </main>
      <footer className="bg-land-ink px-6 md:px-10 py-8">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between text-land-small text-land-paper/50 font-landing-text">
          <span>ТоргОС</span>
          <Link href="/login" className="underline underline-offset-2 hover:text-land-paper">
            Уже есть аккаунт? Войти
          </Link>
        </div>
      </footer>
    </div>
  );
}
