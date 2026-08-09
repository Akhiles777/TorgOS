import { LandingButton } from "./LandingButton";
import { ScreenshotFrame } from "./ScreenshotFrame";

// Продукт виден в первые пять секунд: заголовок слева, реальный экран кассы
// справа. На мобильном — сообщение и кнопка сначала (до неё ближе большому
// пальцу), скриншот сразу следом, не в конце длинного скролла.
export function Hero() {
  return (
    <section className="max-w-[1180px] mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-12 sm:pb-20">
      <div className="grid lg:grid-cols-[1fr_1.05fr] gap-10 lg:gap-14 items-center">
        <div>
          <h1 className="font-landing-display font-semibold text-land-graphite text-[1.9rem] sm:text-5xl lg:text-[3.4rem] leading-[1.12] sm:leading-[1.08] tracking-tight max-w-[17ch] sm:max-w-[14ch]">
            Знаете, что реально есть на полке — не открывая тетрадь
          </h1>
          <p className="font-landing-text text-land-graphite-soft text-base sm:text-lg leading-relaxed mt-5 max-w-[46ch]">
            Касса и учёт для магазина или кафе. Пробиваете чек обычным сканером или камерой телефона — а остатки,
            недостачи и что пора докупить видно сами, без вечерней сверки в тетради.
          </p>
          <div className="mt-7 flex flex-col items-start gap-2.5">
            <LandingButton href="/register" size="lg">
              Начать бесплатно
            </LandingButton>
            <span className="font-landing-text text-sm text-land-graphite-soft">
              14 дней бесплатно · Карта не нужна · Работает с вашим сканером и телефоном
            </span>
          </div>
        </div>

        <ScreenshotFrame label="касса с открытым чеком" aspect="aspect-[5/4]" />
      </div>
    </section>
  );
}
