import { Section, SectionHeading } from "./Section";
import { Card } from "./Card";

const TRACKS = [
  {
    tag: "Магазин",
    title: "Продуктовый, хозтовары, у дома",
    venues: ["Продуктовый магазин", "Магазин у дома", "Хозтовары", "Небольшой супермаркет"],
    body: "Сканируете штрихкод на кассе — остаток списывается сам. Видно, что заканчивается, что просрочено, что зависло на полке без продаж.",
  },
  {
    tag: "Кафе / общепит",
    title: "Пекарни, кофейни, кондитерские",
    venues: ["Пекарня", "Кофейня", "Кондитерская", "Небольшая столовая", "Точка с собственным производством"],
    body: "Задаёте рецепт блюда — система сама считает расход ингредиентов и себестоимость каждой продажи, вплоть до молока в капучино.",
  },
] as const;

export function AudienceSection() {
  return (
    <Section tone="surface">
      <SectionHeading className="mb-4">Для одной точки, где владелец сам за прилавком</SectionHeading>
      <p className="font-landing-text text-land-body text-land-muted max-w-[62ch] mb-10">
        Два разных сценария — общая идея: не тратить время на софт, рассчитанный на сеть или ресторан с залом и официантами.
      </p>
      <div className="grid sm:grid-cols-2 gap-6">
        {TRACKS.map((track) => (
          <Card key={track.tag} className="p-6 sm:p-8 flex flex-col" data-reveal>
            <div className="font-landing-mono text-land-mono-sm text-land-signal uppercase tracking-[0.04em]">{track.tag}</div>
            <h3 className="font-landing-display font-bold text-land-h3 text-land-ink mt-2 mb-4">{track.title}</h3>
            <div className="flex flex-wrap gap-2 mb-5">
              {track.venues.map((v) => (
                <span key={v} className="font-landing-text text-land-small text-land-ink bg-land-paper border border-land-line rounded-land-control px-3 py-1.5">
                  {v}
                </span>
              ))}
            </div>
            <p className="font-landing-text text-land-body text-land-muted mt-auto">{track.body}</p>
          </Card>
        ))}
      </div>
      <p className="font-landing-text text-land-body text-land-muted mt-10 max-w-[58ch]">
        iiko и Poster — сильные и функциональные системы, но рассчитаны на другое: зал, официантов, сложный штат. Мы строим простой учёт для команды из одного-пяти человек.
      </p>
    </Section>
  );
}
