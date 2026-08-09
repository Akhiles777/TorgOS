import { Section, SectionHeading } from "./Section";
import { ProductScreenshot } from "./ProductScreenshot";

// Фирменный элемент — сохранён полностью, перекрашен под новую палитру:
// суммы справа зелёным --signal вместо прежнего терракотового акцента.
const ROWS = [
  { code: "СКАН-01", body: "Пробиваете обычным сканером — или камерой телефона, если сканера ещё нет", effect: "без терминала за 40 000 ₽" },
  { code: "ОСТАТОК-02", body: "Каждая продажа сразу списывает остаток нужной позиции", effect: "видно в реальном времени" },
  { code: "АНАЛИЗ-03", body: "Каждый чек попадает в общую картину — что берут, а что просто стоит", effect: "по дням и по позициям" },
  { code: "СОВЕТ-04", body: "Система подсказывает, что заканчивается и пора докупить", effect: "докупаете вовремя" },
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
