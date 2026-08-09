import { Section, SectionHeading } from "./Section";
import { NotebookIcon, HiddenIcon, ClockIcon } from "./PainIcons";

const PAINS = [
  {
    Icon: NotebookIcon,
    title: "Тетрадь заполняется через раз",
    body: "К вечеру никто не помнит, сколько курабье осталось на полке, а сколько уже унесли на пробу. Учёт как будто есть, а толку от него нет.",
  },
  {
    Icon: HiddenIcon,
    title: "Недостачи, которых не видно",
    body: "Товар пришёл, товар ушёл — а где именно потерялось, непонятно. Без остатка по каждой позиции недостача всплывает только на большой ревизии раз в квартал.",
  },
  {
    Icon: ClockIcon,
    title: "То протухает, то заканчивается",
    body: "Закупаете на глаз — то просроченное неделями лежит на полке, то самое ходовое кончилось в пятницу вечером, и покупатель уходит в соседний магазин.",
  },
] as const;

export function ProblemSection() {
  return (
    <Section tone="surface">
      <SectionHeading className="mb-16">Знакомо?</SectionHeading>
      <div className="grid sm:grid-cols-3 gap-10 sm:gap-8">
        {PAINS.map(({ Icon, title, body }, i) => (
          <div key={title} data-reveal data-reveal-delay={i}>
            <Icon />
            <h3 className="font-landing-display font-bold text-land-h3 text-land-ink mt-4 mb-2">{title}</h3>
            <p className="font-landing-text text-land-body text-land-muted">{body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
