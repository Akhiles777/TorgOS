import { ScreenshotPlaceholder } from "./ScreenshotPlaceholder";

const ROWS = [
  {
    code: "СКАН-01",
    body: "Пробиваете обычным сканером — или камерой телефона, если сканера ещё нет",
    effect: "без терминала за 40 000 ₽",
  },
  {
    code: "ОСТАТОК-02",
    body: "Каждая продажа сразу списывает остаток нужной позиции",
    effect: "видно в реальном времени",
  },
  {
    code: "АНАЛИЗ-03",
    body: "Каждый чек попадает в общую картину — что берут, а что просто стоит",
    effect: "по дням и по позициям",
  },
  {
    code: "СОВЕТ-04",
    body: "Система подсказывает, что заканчивается и пора докупить",
    effect: "докупаете вовремя",
  },
] as const;

export function HowItWorksSection() {
  return (
    <section className="border-t-2 border-dashed border-line px-5 py-10 sm:px-8">
      <h2 className="font-landing-text font-bold text-2xl tracking-tight mb-6">Как это работает</h2>
      <ul className="space-y-0">
        {ROWS.map((row) => (
          <li key={row.code} className="py-3 border-b border-line last:border-b-0">
            <div className="flex items-baseline">
              <span className="font-landing-display tabular-nums text-xs text-ink-soft">{row.code}</span>
              <span className="leader" aria-hidden />
              <span className="font-landing-display tabular-nums text-xs text-stamp shrink-0 text-right">
                {row.effect}
              </span>
            </div>
            <p className="text-[15px] leading-snug mt-1">{row.body}</p>
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <ScreenshotPlaceholder label="касса во время сканирования штрихкода" />
      </div>
    </section>
  );
}
