import { Section, SectionHeading } from "./Section";
import { ProductScreenshot } from "./ProductScreenshot";

export function InventorySection() {
  return (
    <Section tone="surface">
      <div className="grid lg:grid-cols-[1fr_1fr] gap-10 lg:gap-16 items-center">
        <div data-reveal>
          <SectionHeading className="mb-6 max-w-[16ch]">Инвентаризация за час, а не за день</SectionHeading>
          <p className="font-landing-text text-land-body text-land-muted max-w-[50ch] mb-8">
            Не нужно закрывать точку на день: пересчитываете продукты с телефона за час. Система сверяет фактический
            остаток с тем, что должно быть по рецептам и продажам, и показывает только расхождения.
          </p>
          <div className="flex items-end gap-6 font-landing-mono">
            <div>
              <div className="text-land-mono-sm text-land-muted uppercase tracking-[0.04em] mb-1">Было</div>
              <div className="text-land-h3 text-land-muted line-through decoration-2">весь день</div>
            </div>
            <div className="text-land-h3 text-land-muted">→</div>
            <div>
              <div className="text-land-mono-sm text-land-signal uppercase tracking-[0.04em] mb-1">Стало</div>
              <div className="text-land-h3 text-land-signal">1 час</div>
            </div>
          </div>
        </div>

        <div data-reveal>
          <ProductScreenshot file="scan.png" alt="Сканирование камерой телефона на инвентаризации" label="сканирование камерой на пересчёте" aspect="aspect-[4/3]" />
        </div>
      </div>
    </Section>
  );
}
