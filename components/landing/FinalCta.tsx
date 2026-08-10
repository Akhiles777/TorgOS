import { Section } from "./Section";
import { LandingButton } from "./LandingButton";

// Единственное место на странице с центрированием — по спецификации это
// разрешённое исключение. Инверсия в --ink как сильный завершающий момент.
export function FinalCta() {
  return (
    <Section tone="ink" className="text-center">
      <div data-reveal>
        <h2 className="font-landing-display font-extrabold text-land-h2 tracking-[-0.02em] text-land-paper max-w-[22ch] mx-auto">
          Хватит тетради. Начать бесплатно.
        </h2>
        <div className="mt-10">
          <LandingButton href="/register" size="lg" trackId="final">
            Начать бесплатно
          </LandingButton>
        </div>
      </div>
    </Section>
  );
}
