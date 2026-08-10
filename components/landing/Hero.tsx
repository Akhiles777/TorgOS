import { LandingButton } from "./LandingButton";
import { ProductScreenshot } from "./ProductScreenshot";

// Пропорция 55/45, скриншот 16:10 — продукт виден сразу, не квадратная заглушка.
export function Hero() {
  return (
    <section className="bg-land-paper pt-10 md:pt-14 pb-16 md:pb-20">
      <div className="max-w-[1200px] mx-auto px-6 md:px-10 grid lg:grid-cols-[55fr_45fr] gap-10 lg:gap-16 items-center">
        <div>
          <h1 className="font-landing-display font-extrabold text-land-h1 tracking-[-0.02em] text-land-ink max-w-[15ch]">
            Знаете, что реально есть на полке — не открывая тетрадь
          </h1>
          <p className="font-landing-text text-land-body text-land-muted mt-6 max-w-[46ch]">
            Касса и учёт для магазина или кафе. Пробиваете чек обычным сканером или камерой телефона — а остатки,
            недостачи и что пора докупить видно сами, без вечерней сверки в тетради.
          </p>
          <div className="mt-8 flex flex-col items-start gap-3">
            <LandingButton href="/register" size="lg" trackId="hero">
              Начать бесплатно
            </LandingButton>
            <span className="font-landing-text text-land-small text-land-muted">
              14 дней бесплатно · Карта не нужна · Работает с вашим сканером и телефоном
            </span>
          </div>
        </div>

        <div>
          <ProductScreenshot file="pos.png" alt="Касса ТоргОС с открытым чеком" label="касса с открытым чеком" aspect="aspect-[16/10]" priority />
        </div>
      </div>
    </section>
  );
}
