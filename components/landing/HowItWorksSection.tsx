import { Section, SectionHeading } from "./Section";
import { ProductScreenshot } from "./ProductScreenshot";

// Фирменный элемент — сохранён полностью, перекрашен под новую палитру:
// суммы справа зелёным --signal вместо прежнего терракотового акцента.
const ROWS = [
  { code: "СКАН-01", body: "Сканируете товар на кассе — молоко, хлеб, консервы — остаток обновляется сам, без тетради", effect: "без тетради" },
  { code: "РЕЦЕПТ-02", body: "В кафе задаёте рецепт блюда — система знает себестоимость каждой позиции", effect: "цена без гадания" },
  { code: "ПРОДАЖА-03", body: "Продали капучино — списались молоко, зерно и стакан, а не просто «капучино»", effect: "остаток сходится" },
  { code: "ДЕНЬ-04", body: "В конце дня видно, что заработало — и витрина магазина, и касса кафе", effect: "решения по фактам" },
] as const;

export function HowItWorksSection() {
  return (
    <Section tone="paper">
      <SectionHeading className="mb-16">Как это работает</SectionHeading>

      <div className="grid lg:grid-cols-[1fr_1fr] gap-10 lg:gap-16 items-center">
        <div data-reveal className="bg-land-surface border border-land-line rounded-land-card shadow-land-card receipt-torn">
          <div className="px-6 sm:px-8 pt-6 pb-2">
            {ROWS.map((row, i) => (
              <div key={row.code} className="py-4 border-b border-dashed border-land-line last:border-b-0" data-reveal-row data-reveal-delay={i}>
                <div className="flex items-baseline">
                  <span className="font-landing-mono text-land-mono-sm tracking-[0.04em] text-land-muted">{row.code}</span>
                  <span className="leader-land" aria-hidden data-reveal-dots />
                  <span className="font-landing-mono text-land-mono-sm tracking-[0.04em] text-land-signal shrink-0 text-right" data-reveal-amount>
                    {row.effect}
                  </span>
                </div>
                <p className="font-landing-text text-land-body text-land-ink mt-1.5">{row.body}</p>
              </div>
            ))}
          </div>
        </div>

        <ProductScreenshot file="owner.png" alt="Дашборд владельца с аналитикой продаж" label="дашборд владельца с аналитикой" aspect="aspect-[4/3]" />
      </div>
    </Section>
  );
}
