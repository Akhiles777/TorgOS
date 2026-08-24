import { Section } from "./Section";
import { LandingButton } from "./LandingButton";
import { WaitlistForm } from "./WaitlistForm";

// Единственное место на странице с центрированием — по спецификации это
// разрешённое исключение. Инверсия в --ink как сильный завершающий момент.
export function FinalCta() {
  return (
    <Section tone="ink" className="text-center">
      <div data-reveal>
        <h2 className="font-landing-display font-extrabold text-land-h2 tracking-[-0.02em] text-land-paper max-w-[22ch] mx-auto">
          Поймёте, куда уходят продукты. Увидите, что приносит деньги.
        </h2>
        <p className="font-landing-text text-land-body text-land-paper/70 max-w-[55ch] mx-auto mt-5">
          14 дней бесплатно, карта не нужна. Заведёте магазин или кафе за минуту и сразу увидите, как это работает на вашей точке.
        </p>
        <div className="mt-8">
          <LandingButton href="/register" size="lg" trackId="final">
            Начать бесплатно
          </LandingButton>
        </div>

        <div className="mt-16 pt-16 border-t border-land-paper/15" id="waitlist">
          <p className="font-landing-text text-land-body text-land-paper/70 max-w-[50ch] mx-auto mb-8">
            Не готовы регистрироваться сразу? Оставьте заявку — мы свяжемся и поможем разобраться, подойдёт ли сервис именно вашей точке.
          </p>
          <div className="max-w-3xl mx-auto bg-land-paper p-5 sm:p-8">
            <WaitlistForm />
          </div>
        </div>
      </div>
    </Section>
  );
}
