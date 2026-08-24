// Общая обёртка для юридических страниц (/legal/offer, /legal/privacy) — те
// же токены и шрифты лендинга (components/landing/*), чтобы переход по ссылке
// из футера не выглядел сменой сайта. Простая читаемая типографика, без
// декоративных элементов лендинга (карточек/скролл-реveal) — это документ, не
// маркетинг.
import "@fontsource-variable/unbounded/wght.css";
import "@fontsource-variable/golos-text/wght.css";
import Link from "next/link";
import type { ReactNode } from "react";

export function LegalLayout({ title, updatedAt, children }: { title: string; updatedAt: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-land-paper font-landing-text">
      <header className="border-b border-land-line px-6 md:px-10 py-5">
        <div className="max-w-[760px] mx-auto flex items-center justify-between">
          <Link href="/" className="font-landing-display font-bold text-land-ink text-lg tracking-[-0.02em]">
            ТоргОС
          </Link>
          <Link href="/" className="text-land-small text-land-muted underline underline-offset-2 hover:text-land-ink">
            На главную
          </Link>
        </div>
      </header>
      <main className="max-w-[760px] mx-auto px-6 md:px-10 py-12 md:py-16">
        <h1 className="font-landing-display font-bold text-land-h2 tracking-[-0.02em] text-land-ink">{title}</h1>
        <p className="font-landing-mono text-land-mono-sm text-land-muted mt-2">Действует с {updatedAt}</p>
        <div className="legal-prose mt-10">{children}</div>
      </main>
      <footer className="border-t border-land-line px-6 md:px-10 py-8">
        <div className="max-w-[760px] mx-auto text-land-small text-land-muted">
          <Link href="/legal/offer" className="underline underline-offset-2 hover:text-land-ink">Публичная оферта</Link>
          {" · "}
          <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-land-ink">Политика конфиденциальности</Link>
        </div>
      </footer>
    </div>
  );
}
