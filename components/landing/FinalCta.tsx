import { LinkButton } from "@/components/ui";

// «Итого» настоящего чека — финальная строка страницы, крупнее и жирнее
// всего, что было выше. Кнопка — отрывной язычок ленты.
export function FinalCta() {
  return (
    <section className="border-t-2 border-dashed border-line bg-ink text-paper px-5 py-10 sm:px-8 receipt-torn">
      <div className="font-landing-display tabular-nums text-sm text-paper/60 mb-2">ИТОГО</div>
      <h2 className="font-landing-display text-2xl sm:text-3xl leading-snug mb-6 max-w-[22ch]">
        Хватит тетради. Начать бесплатно.
      </h2>
      <LinkButton href="/register" variant="fresh" size="xl" className="w-full sm:w-auto">
        Начать бесплатно
      </LinkButton>
    </section>
  );
}
