import { ScreenshotFrame } from "./ScreenshotFrame";

// Единственная секция, которой намеренно дано больше воздуха — эта мысль
// продаёт сама. Здесь же — «камерный» скриншот: сканирование телефоном на
// пересчёте буквально то, о чём идёт речь в тексте.
export function InventorySection() {
  return (
    <section className="max-w-[1180px] mx-auto px-4 sm:px-6 py-14 sm:py-20">
      <div className="grid lg:grid-cols-[1fr_1fr] gap-10 items-center">
        <div>
          <h2 className="font-landing-display font-semibold text-land-graphite text-2xl sm:text-3xl tracking-tight mb-4 max-w-[16ch]">
            Инвентаризация за час, а не за день
          </h2>
          <p className="font-landing-text text-land-graphite-soft text-base leading-relaxed max-w-[50ch] mb-6">
            Знакомая картина: магазин закрывается на целый день, весь коллектив с бумажкой и калькулятором пересчитывает
            полки. С телефоном в руках это час — сканируете позицию за позицией, система сама сверяет с тем, что должно
            быть по базе, и показывает только расхождения. Списание или оприходование — одной кнопкой.
          </p>
          <div className="flex items-end gap-5 font-landing-mono tabular-nums">
            <div>
              <div className="text-xs text-land-graphite-soft uppercase tracking-wide mb-1">Было</div>
              <div className="text-2xl text-land-graphite-soft line-through decoration-2">весь день</div>
            </div>
            <div className="text-2xl text-land-graphite-soft">→</div>
            <div>
              <div className="text-xs text-land-signal-text uppercase tracking-wide mb-1">Стало</div>
              <div className="text-2xl text-land-signal-text">1 час</div>
            </div>
          </div>
        </div>

        <ScreenshotFrame label="сканирование камерой на пересчёте" aspect="aspect-[4/3]" />
      </div>
    </section>
  );
}
