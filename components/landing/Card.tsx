import type { ReactNode } from "react";

// Карточка — 8px радиус, 1px граница --line, одна тень из токенов. Больше
// никаких вариаций (никаких вторых теней, размытых свечений, градиентов).
export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`bg-land-paper border border-land-line rounded-land-card shadow-land-card ${className}`}>{children}</div>;
}
