import { LandingButton } from "./LandingButton";

// Цены — плейсхолдеры: реальные суммы подставляются позже. Обычные карточки,
// не под чек — фирменный мотив на странице живёт только в «Как это работает».
const PLANS = [
  { name: "Пробный", price: "0 ₽", period: "14 дней", note: "Все функции, карта не нужна", featured: false },
  { name: "Одна точка", price: "от ___ ₽", period: "в месяц", note: "Один магазин, безлимит по товарам", featured: true },
  { name: "Сеть", price: "от ___ ₽", period: "в месяц", note: "Несколько точек, общая аналитика", featured: false },
] as const;

export function PricingSection() {
  return (
    <section id="pricing" className="bg-land-ash-deep">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <h2 className="font-landing-display font-semibold text-land-graphite text-2xl sm:text-3xl tracking-tight mb-8 text-center">Тарифы</h2>
        <div className="grid sm:grid-cols-3 gap-4 max-w-[880px] mx-auto">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`rounded-tag p-5 border ${p.featured ? "bg-land-graphite border-land-graphite" : "bg-land-ash border-land-graphite/15"}`}
            >
              <div className={`font-landing-text font-semibold ${p.featured ? "text-land-ash" : "text-land-graphite"}`}>{p.name}</div>
              <div className={`font-landing-mono tabular-nums text-2xl mt-2 ${p.featured ? "text-land-ash" : "text-land-graphite"}`}>
                {p.price}
              </div>
              <div className={`text-xs mt-0.5 ${p.featured ? "text-land-ash/60" : "text-land-graphite-soft"}`}>{p.period}</div>
              <div className={`font-landing-text text-sm mt-3 ${p.featured ? "text-land-ash/80" : "text-land-graphite-soft"}`}>{p.note}</div>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <LandingButton href="/register" size="lg">Начать бесплатно</LandingButton>
        </div>
      </div>
    </section>
  );
}
