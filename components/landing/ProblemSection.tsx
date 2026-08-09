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
    <section className="bg-land-ash-deep">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h2 className="font-landing-display font-semibold text-land-graphite text-2xl sm:text-3xl tracking-tight mb-8">Знакомо?</h2>
        <div className="grid sm:grid-cols-3 gap-6 sm:gap-8">
          {PAINS.map(({ Mark, title, body }) => (
            <div key={title}>
              <Mark />
              <h3 className="font-landing-text font-semibold text-land-graphite mt-3 mb-1.5">{title}</h3>
              <p className="font-landing-text text-land-graphite-soft text-[15px] leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
