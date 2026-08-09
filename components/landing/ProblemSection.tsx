import { TornPaperMark, BarcodeMark, ExpiryStampMark } from "./PainMarks";

const PAINS = [
  {
    Mark: TornPaperMark,
    title: "Тетрадь заполняется через раз",
    body: "К вечеру никто не помнит, сколько курабье осталось на полке, а сколько уже унесли на пробу. Учёт как будто есть, а толку от него нет.",
  },
  {
    Mark: BarcodeMark,
    title: "Недостачи, которых не видно",
    body: "Товар пришёл, товар ушёл — а где именно потерялось, непонятно. Без остатка по каждой позиции недостача всплывает только на большой ревизии раз в квартал.",
  },
  {
    Mark: ExpiryStampMark,
    title: "То протухает, то заканчивается",
    body: "Закупаете на глаз — то просроченное неделями лежит на полке, то самое ходовое кончилось в пятницу вечером, и покупатель уходит в соседний магазин.",
  },
] as const;

export function ProblemSection() {
  return (
    <section className="border-t-2 border-dashed border-line px-5 py-10 sm:px-8">
      <h2 className="font-landing-text font-bold text-2xl tracking-tight mb-6">Знакомо?</h2>
      <ul className="space-y-6">
        {PAINS.map(({ Mark, title, body }) => (
          <li key={title} className="flex gap-4">
            <Mark />
            <div>
              <h3 className="font-landing-text font-semibold mb-1">{title}</h3>
              <p className="text-ink-soft text-[15px] leading-relaxed">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
