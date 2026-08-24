import { Section, SectionHeading } from "./Section";
import { Card } from "./Card";
import { NotebookIcon, HiddenIcon, ClockIcon } from "./PainIcons";

const PAINS = [
  {
    Icon: NotebookIcon,
    title: "Цена есть, прибыли нет",
    body: "Товар или блюдо продаётся по цене соседа, а реальная себестоимость — молоко и зерно в капучино, закупка в ценнике — никто не считал.",
  },
  {
    Icon: HiddenIcon,
    title: "Продукты уходят неизвестно куда",
    body: "Мука заканчивается раньше расчёта, молоко скисает, товар на полке не сходится с тем, что должно быть. Перерасход, списание или просто никто не записал.",
  },
  {
    Icon: ClockIcon,
    title: "Не видно, что приносит деньги",
    body: "Кажется, что лучше всего идёт одна позиция, а по факту маржа живёт в другой. Узнать это получается только в конце месяца — если вообще получается.",
  },
] as const;

export function ProblemSection() {
  return (
    <Section tone="surface">
      <SectionHeading className="mb-10">Знакомо?</SectionHeading>
      <div className="grid sm:grid-cols-3 gap-6">
        {PAINS.map(({ Icon, title, body }, i) => (
          <Card key={title} className="p-6 sm:p-8 flex flex-col">
            <div data-reveal data-reveal-delay={i}>
              <Icon />
              <h3 className="font-landing-display font-bold text-land-h3 text-land-ink mt-5 mb-2.5">{title}</h3>
              <p className="font-landing-text text-land-body text-land-muted">{body}</p>
            </div>
          </Card>
        ))}
      </div>
    </Section>
  );
}
