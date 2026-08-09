import type { ReactNode } from "react";

// Обёртка секции: ширина/поля/вертикальный ритм — по шкале из токенов
// (max-w 1200px, поля 40px/24px = px-10/px-6, ритм между секциями 144px/96px
// = py-36/py-24 — те же числа, что в спецификации, это стандартная шкала
// Tailwind, отдельных токенов под неё заводить не пришлось).
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
    <section id={id} className={`${bg} py-24 md:py-36 ${className}`} data-reveal-section>
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
