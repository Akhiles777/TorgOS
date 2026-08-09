// Самохостинг PT Sans / PT Mono только для этой страницы — приложение
// (касса/админка/владелец) продолжает работать на системных шрифтах,
// эти файлы в их бандл не попадают.
import "@fontsource/pt-sans/400.css";
import "@fontsource/pt-sans/700.css";
import "@fontsource/pt-mono/400.css";

import Link from "next/link";
import { ReceiptHeader } from "./ReceiptHeader";
import { ProblemSection } from "./ProblemSection";
import { HowItWorksSection } from "./HowItWorksSection";
import { InventorySection } from "./InventorySection";
import { PricingSection } from "./PricingSection";
import { FaqSection } from "./FaqSection";
import { FinalCta } from "./FinalCta";

// Вся страница — один длинный чек: секции идут как позиции, рваный край
// между ними, «итого» — последняя строка перед отрывом.
export function Landing() {
  return (
    <div className="min-h-[100dvh] bg-paper-2 sm:py-10">
      <main className="receipt mx-auto w-full max-w-[720px] sm:border sm:border-line sm:shadow-sm">
        <ReceiptHeader />
        <ProblemSection />
        <HowItWorksSection />
        <InventorySection />
        <PricingSection />
        <FaqSection />
        <FinalCta />
        <footer className="px-5 py-6 sm:px-8 flex items-center justify-between text-xs text-ink-soft">
          <span>ТоргОС</span>
          <Link href="/login" className="underline underline-offset-2 hover:text-ink">
            Уже есть аккаунт? Войти
          </Link>
        </footer>
      </main>
    </div>
  );
}
