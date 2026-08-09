// Самохостинг только для этой страницы — приложение (касса/админка/владелец)
// продолжает работать на своих токенах, эти файлы в их бандл не попадают.
// Полные файлы (не cyrillic-*): в поднаборах по unicode-range цифры лежат в
// latin, отдельный cyrillic-файл их не покрывает (тот же баг, что уже ловил).
import "@fontsource/oswald/500.css";
import "@fontsource/oswald/600.css";
import "@fontsource/pt-sans/400.css";
import "@fontsource/pt-sans/700.css";
import "@fontsource/pt-mono/400.css";

import Link from "next/link";
import { LandingHeader } from "./LandingHeader";
import { Hero } from "./Hero";
import { ProblemSection } from "./ProblemSection";
import { HowItWorksSection } from "./HowItWorksSection";
import { InventorySection } from "./InventorySection";
import { PricingSection } from "./PricingSection";
import { FaqSection } from "./FaqSection";
import { FinalCta } from "./FinalCta";

// v2: фирменный мотив чека сужен до одной карточки в «Как это работает» —
// остальная страница спокойная, современная, широкая. См. дизайн-план v2.
export function Landing() {
  return (
    <div className="min-h-[100dvh] bg-land-ash font-landing-text">
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
      <footer className="bg-land-graphite px-4 sm:px-6 py-6">
        <div className="max-w-[1180px] mx-auto flex items-center justify-between text-xs text-land-ash/50">
          <span>ТоргОС</span>
          <Link href="/login" className="underline underline-offset-2 hover:text-land-ash">
            Уже есть аккаунт? Войти
          </Link>
        </div>
      </footer>
    </div>
  );
}
