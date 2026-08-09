import Link from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";

// Локальная кнопка лендинга — своя палитра (--color-land-*), поэтому не
// переиспользует Button/LinkButton из components/ui.tsx (те на токенах
// приложения). Единственный яркий акцент на всей странице — variant="signal".
type Variant = "signal" | "line" | "ghost";
type Size = "md" | "lg";

const base = "inline-flex items-center justify-center gap-2 font-landing-text font-semibold rounded-tag select-none transition-colors active:scale-[0.98] focus-visible:outline-3";
const sizes: Record<Size, string> = { md: "h-11 px-5 text-[15px]", lg: "h-14 px-7 text-lg" };
const variants: Record<Variant, string> = {
  signal: "bg-land-signal text-land-ash hover:brightness-110",
  line: "bg-transparent text-land-graphite border border-land-graphite/30 hover:border-land-graphite",
  ghost: "bg-transparent text-land-graphite-soft hover:text-land-graphite",
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
