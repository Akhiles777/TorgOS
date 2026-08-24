import { Section, SectionHeading } from "./Section";
import { Card } from "./Card";
import { LandingButton } from "./LandingButton";

const PLANS = [
  {
    name: "Старт",
    price: "950",
    period: "₽ / мес",
    tagline: "Одна точка — магазин или кафе",
    features: [
      "Касса на телефоне или планшете",
      "Остатки и склад (для кафе — ингредиенты)",
      "Рецепты и себестоимость блюд",
      "Чеки за день, долги, инвентаризация",
    ],
    highlight: false,
  },
  {
    name: "Профи",
    price: "1 850",
    period: "₽ / мес",
    tagline: "Несколько точек или production",
    features: [
      "Всё из тарифа «Старт»",
      "Несколько точек в одном кабинете",
      "Приёмка накладных и сводка от ИИ",
      "Импорт номенклатуры, камеры, приоритетная поддержка",
    ],
    highlight: true,
  },
] as const;

export function PricingSection() {
  return (
    <Section tone="paper" id="pricing">
      <SectionHeading className="mb-4">Сколько это стоит</SectionHeading>
      <p className="font-landing-text text-land-body text-land-muted max-w-[60ch]">
        14 дней бесплатно на любом тарифе — карта не нужна, можно попробовать на своей точке без риска. Дальше — один из двух простых тарифов, без скрытых доплат за пользователей или интеграции.
      </p>
      <div className="mt-12 grid sm:grid-cols-2 gap-6">
        {PLANS.map((plan) => (
          <Card key={plan.name} className={`p-6 sm:p-8 flex flex-col ${plan.highlight ? "border-land-signal border-2" : ""}`}>
            <div className="font-landing-mono text-land-mono-sm text-land-signal uppercase tracking-[0.04em]">{plan.tagline}</div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-landing-display font-extrabold text-land-h2 text-land-ink">{plan.name}</span>
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="font-landing-display font-bold text-land-h2 text-land-ink">{plan.price}</span>
              <span className="font-landing-mono text-land-body text-land-muted">{plan.period}</span>
            </div>
            <ul className="mt-6 space-y-2.5 flex-1">
              {plan.features.map((f) => (
                <li key={f} className="font-landing-text text-land-body text-land-ink flex items-start gap-2.5">
                  <span className="text-land-signal shrink-0 mt-0.5" aria-hidden>✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <LandingButton href="/register" variant={plan.highlight ? "signal" : "line"} size="md" className="mt-8 w-full" trackId={`pricing-${plan.name}`}>
              Начать бесплатно
            </LandingButton>
          </Card>
        ))}
      </div>
      <p className="font-landing-text text-land-small text-land-muted mt-6">
        Оплата помесячная, без долгосрочных обязательств — отменить можно в любой момент из кабинета владельца.
      </p>
    </Section>
  );
}
