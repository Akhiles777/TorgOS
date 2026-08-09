import { LinkButton } from "@/components/ui";

// Цены — плейсхолдеры (пункт 1 из обсуждения плана): реальные суммы
// подставляются позже.
const PLANS = [
  { name: "Пробный", price: "0 ₽", period: "14 дней", note: "Все функции, карта не нужна" },
  { name: "Одна точка", price: "от ___ ₽", period: "в месяц", note: "Один магазин, безлимит по товарам" },
  { name: "Сеть", price: "от ___ ₽", period: "в месяц", note: "Несколько точек, общая аналитика" },
] as const;

export function PricingSection() {
  return (
    <section id="pricing" className="border-t-2 border-dashed border-line px-5 py-10 sm:px-8">
      <h2 className="font-landing-text font-bold text-2xl tracking-tight mb-6">Тарифы</h2>
      <ul className="space-y-0">
        {PLANS.map((p) => (
          <li key={p.name} className="py-4 border-b border-line last:border-b-0">
            <div className="flex items-baseline">
              <span className="font-landing-text font-semibold">{p.name}</span>
              <span className="leader" aria-hidden />
              <span className="font-landing-display tabular-nums text-lg shrink-0 text-right">{p.price}</span>
            </div>
            <div className="text-xs text-ink-soft mt-0.5">
              {p.note} · {p.period}
            </div>
          </li>
        ))}
      </ul>
      <LinkButton href="/register" variant="stamp" size="lg" className="w-full mt-6">
        Начать бесплатно
      </LinkButton>
    </section>
  );
}
