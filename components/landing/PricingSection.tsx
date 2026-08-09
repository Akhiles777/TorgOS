import { Section, SectionHeading } from "./Section";
import { LandingButton } from "./LandingButton";
import { Card } from "./Card";

// Цены — плейсхолдеры: реальные суммы подставляются позже.
const PLANS = [
  { name: "Пробный", price: "0 ₽", period: "14 дней", note: "Все функции, карта не нужна", featured: false },
  { name: "Одна точка", price: "от ___ ₽", period: "в месяц", note: "Один магазин, безлимит по товарам", featured: true },
  { name: "Сеть", price: "от ___ ₽", period: "в месяц", note: "Несколько точек, общая аналитика", featured: false },
] as const;

export function PricingSection() {
  return (
    <Section tone="paper" id="pricing">
      <SectionHeading className="mb-16">Тарифы</SectionHeading>
      <div className="grid sm:grid-cols-3 gap-6">
        {PLANS.map((p, i) => (
          <Card key={p.name} className={`p-6 ${p.featured ? "border-land-signal border-2" : ""}`}>
            <div data-reveal data-reveal-delay={i}>
              {p.featured && (
                <span className="inline-block font-landing-mono text-land-mono-sm text-land-signal uppercase tracking-[0.04em] mb-2">
                  Популярный
                </span>
              )}
              <div className="font-landing-text font-medium text-land-body text-land-ink">{p.name}</div>
              <div className="font-landing-mono text-land-h3 text-land-ink mt-2">{p.price}</div>
              <div className="font-landing-mono text-land-mono-sm text-land-muted mt-0.5">{p.period}</div>
              <div className="font-landing-text text-land-small text-land-muted mt-3">{p.note}</div>
            </div>
          </Card>
        ))}
      </div>
      <div className="mt-10">
        <LandingButton href="/register" size="lg">
          Начать бесплатно
        </LandingButton>
      </div>
    </Section>
  );
}
