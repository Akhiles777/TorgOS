import type { ReactNode } from "react";

// Обёртка секции: ширина/поля/вертикальный ритм — по шкале из токенов
// (max-w 1200px, поля 40px/24px = px-10/px-6, ритм между разделами 96px/64px
// = py-24/py-16 — сокращено с исходных 144/96 по правке «слишком много
// воздуха». border-top на каждой секции — граница видна даже там, где
// paper/surface слишком близки по тону, чтобы смена фона читалась сама).
export function Section({
  tone = "paper",
  id,
  className = "",
  containerClassName = "",
  children,
}: {
  tone?: "paper" | "surface" | "ink";
  id?: string;
  className?: string;
  containerClassName?: string;
  children: ReactNode;
}) {
  const bg = { paper: "bg-land-paper", surface: "bg-land-surface", ink: "bg-land-ink" }[tone];
  return (
    <section id={id} className={`${bg} border-t border-land-line py-16 md:py-24 ${className}`} data-reveal-section>
      <div className={`max-w-[1200px] mx-auto px-6 md:px-10 ${containerClassName}`}>{children}</div>
    </section>
  );
}

// Заголовок секции — по правилу «все заголовки по левому краю» (единственное
// исключение — финальный CTA, там центр задаётся на месте, не здесь).
export function SectionHeading({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`font-landing-display font-bold text-land-h2 tracking-[-0.02em] text-land-ink text-left ${className}`}>
      {children}
    </h2>
  );
}
