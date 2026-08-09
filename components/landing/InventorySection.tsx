import { ScreenshotPlaceholder } from "./ScreenshotPlaceholder";

// Единственное место, где рулон намеренно раздаётся вширь — эта мысль
// продаёт сама, ей дано больше воздуха, чем остальным секциям.
export function InventorySection() {
  return (
    <section className="border-t-2 border-dashed border-line px-5 py-10 sm:px-8 bg-paper-2">
      <h2 className="font-landing-text font-bold text-2xl tracking-tight mb-3">
        Инвентаризация за час, а не за день
      </h2>
      <p className="text-ink-soft text-[15px] leading-relaxed max-w-[52ch] mb-6">
        Знакомая картина: магазин закрывается на целый день, весь коллектив с бумажкой и калькулятором пересчитывает
        полки. С телефоном в руках это час — сканируете позицию за позицией, система сама сверяет с тем, что должно
        быть по базе, и показывает только расхождения. Списание или оприходование — одной кнопкой.
      </p>

      <div className="flex items-end gap-6 mb-6 font-landing-display tabular-nums">
        <div>
          <div className="text-xs text-ink-soft uppercase tracking-wide mb-1">Было</div>
          <div className="text-2xl text-ink-soft line-through decoration-2">весь день</div>
        </div>
        <div className="text-2xl text-ink-soft">→</div>
        <div>
          <div className="text-xs text-stamp uppercase tracking-wide mb-1">Стало</div>
          <div className="text-2xl text-stamp-text">1 час</div>
        </div>
      </div>

      <ScreenshotPlaceholder label="отчёт по расхождениям после пересчёта" />
    </section>
  );
}
