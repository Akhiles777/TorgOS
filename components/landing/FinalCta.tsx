import { LandingButton } from "./LandingButton";

// Финальный экран — единственная инверсия в графит на всю страницу. Не под
// чек: просто тёмная секция как сильный завершающий момент.
export function FinalCta() {
  return (
    <section className="bg-land-graphite px-4 sm:px-6 py-16 sm:py-20 text-center">
      <h2 className="font-landing-display font-semibold text-land-ash text-2xl sm:text-3xl leading-snug max-w-[22ch] mx-auto">
        Хватит тетради. Начать бесплатно.
      </h2>
      <div className="mt-7">
        <LandingButton href="/register" size="lg">
          Начать бесплатно
        </LandingButton>
      </div>
    </section>
  );
}
