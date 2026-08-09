import { LinkButton } from "@/components/ui";
import { dateLong } from "@/lib/format";

// Верх страницы — не hero-картинка, а шапка настоящего кассового чека.
// Дата — реальная сегодняшняя, печатается на сервере при каждом заходе.
export function ReceiptHeader() {
  const today = dateLong(new Date());

  return (
    <header className="px-5 pt-6 pb-8 sm:px-8 sm:pt-8 animate-print-in">
      <div className="font-landing-display tabular-nums text-xs text-ink-soft tracking-[0.08em] uppercase mb-6">
        ТоргОС · чек №0001 · {today}
      </div>

      <h1 className="font-landing-display text-[2rem] leading-[1.15] sm:text-[2.6rem] sm:leading-[1.12] tracking-tight max-w-[15ch]">
        Знаете, что реально есть на полке — не открывая тетрадь
      </h1>

      <p className="font-landing-text text-ink-soft text-[15px] sm:text-base leading-relaxed mt-4 max-w-[46ch]">
        Касса и учёт для магазина или кафе. Пробиваете чек обычным сканером или камерой телефона — а остатки,
        недостачи и что пора докупить видно сами, без вечерней сверки в тетради.
      </p>

      <div className="mt-6 flex flex-col items-start gap-2">
        <LinkButton href="/register" variant="stamp" size="xl" className="w-full sm:w-auto">
          Начать бесплатно
        </LinkButton>
        <span className="text-xs text-ink-soft">14 дней бесплатно · Карта не нужна · Работает с вашим сканером и телефоном</span>
      </div>
    </header>
  );
}
