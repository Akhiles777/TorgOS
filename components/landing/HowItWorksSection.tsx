import { ScreenshotFrame } from "./ScreenshotFrame";

// Единственное место на странице, где живёт мотив чека — узкая, физически
// более плотная карточка на фоне спокойной широкой страницы. Контраст ширины
// сам говорит «здесь особое», без нужды стилизовать всё вокруг. Если эту
// карточку убрать — страница остаётся нормальной страницей.
const ROWS = [
  { code: "СКАН-01", body: "Пробиваете обычным сканером — или камерой телефона, если сканера ещё нет", effect: "без терминала за 40 000 ₽" },
  { code: "ОСТАТОК-02", body: "Каждая продажа сразу списывает остаток нужной позиции", effect: "видно в реальном времени" },
  { code: "АНАЛИЗ-03", body: "Каждый чек попадает в общую картину — что берут, а что просто стоит", effect: "по дням и по позициям" },
  { code: "СОВЕТ-04", body: "Система подсказывает, что заканчивается и пора докупить", effect: "докупаете вовремя" },
] as const;

export function HowItWorksSection() {
  return (
    <section className="max-w-[1180px] mx-auto px-4 sm:px-6 py-14 sm:py-20">
      <h2 className="font-landing-display font-semibold text-land-graphite text-2xl sm:text-3xl tracking-tight mb-8 text-center">
        Как это работает
      </h2>

      <div className="max-w-[600px] mx-auto bg-land-ash-deep border border-land-graphite/15 rounded-tag receipt-torn">
        <div className="px-5 sm:px-7 pt-5 pb-1">
          {ROWS.map((row) => (
            <div key={row.code} className="py-3.5 border-b border-dashed border-land-graphite/15 last:border-b-0">
              <div className="flex items-baseline">
                <span className="font-landing-mono tabular-nums text-xs text-land-graphite-soft">{row.code}</span>
                <span className="leader-land" aria-hidden />
                <span className="font-landing-mono tabular-nums text-xs text-land-signal-text shrink-0 text-right">{row.effect}</span>
              </div>
              <p className="font-landing-text text-[15px] text-land-graphite leading-snug mt-1">{row.body}</p>
            </div>
          ))}
        </div>
        <div className="px-5 sm:px-7 pb-6 pt-4">
          <ScreenshotFrame label="дашборд владельца с аналитикой" aspect="aspect-[16/10]" />
        </div>
      </div>
    </section>
  );
}
