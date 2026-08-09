import Link from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";

// Кнопка лендинга — своя палитра (--color-land-*), поэтому не переиспользует
// Button/LinkButton из components/ui.tsx (те на токенах приложения).
// Ховер: фон signal → signal-d за 150ms + сдвиг на 1px вниз, без масштаба и
// свечения. Активное состояние — обратно на место.
type Variant = "signal" | "line" | "ghost";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-landing-text font-medium rounded-land-control select-none " +
  "transition-[background-color,transform,color,border-color] duration-150 ease-out " +
  "translate-y-0 hover:translate-y-px active:translate-y-0 focus-visible:outline-3 " +
  "motion-reduce:transition-none motion-reduce:translate-y-0 motion-reduce:hover:translate-y-0";
const sizes: Record<Size, string> = { md: "h-11 px-5 text-[15px]", lg: "h-14 px-7 text-land-small" };
const variants: Record<Variant, string> = {
  signal: "bg-land-signal text-land-paper hover:bg-land-signal-d",
  line: "bg-transparent text-land-ink border border-land-line hover:border-land-ink",
  ghost: "bg-transparent text-land-muted hover:text-land-ink",
};

export function LandingButton({
  href,
  variant = "signal",
  size = "md",
  className = "",
  children,
  ...rest
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string; variant?: Variant; size?: Size; children: ReactNode }) {
  return (
    <Link href={href} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </Link>
  );
}
