// Свои базовые компоненты (без UI-китов). Всё из токенов.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

type BtnVariant = "stamp" | "fresh" | "ghost" | "line";
const btnBase =
  "inline-flex items-center justify-center gap-2 font-medium rounded-tag select-none transition-transform active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-3";
const btnSizes: Record<string, string> = {
  md: "px-4 h-11 text-[15px]",
  lg: "px-6 h-14 text-lg",
  xl: "px-8 h-20 text-2xl font-semibold",
};
const btnVariants: Record<BtnVariant, string> = {
  stamp: "bg-stamp text-stamp-ink hover:brightness-105",
  fresh: "bg-fresh text-stamp-ink hover:brightness-105",
  ghost: "bg-paper-2 text-ink hover:bg-line/60",
  line: "bg-transparent text-ink border border-line hover:bg-paper-2",
};

export function Button({
  variant = "ghost",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "md" | "lg" | "xl" }) {
  return (
    <button className={`${btnBase} ${btnSizes[size]} ${btnVariants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Field({
  label,
  className = "",
  hint,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return (
    <label className="block">
      {label && <span className="block text-sm text-ink-soft mb-1">{label}</span>}
      <input
        className={`w-full h-11 px-3 bg-paper border border-line rounded-tag text-ink placeholder:text-ink-soft/60 focus:border-ink ${className}`}
        {...rest}
      />
      {hint && <span className="block text-xs text-ink-soft mt-1">{hint}</span>}
    </label>
  );
}

// Числовое поле для денег/веса: обычный текст + inputMode="decimal", а не
// <input type="number"> — тот на многих браузерах не пускает запятую как
// десятичный разделитель и молча обнуляет значение при вводе «199,90».
// Парный парсер — lib/format.ts::parseRuNumber.
export function DecimalField({
  label,
  className = "",
  defaultValue,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> & { label?: string }) {
  return (
    <label className="block">
      {label && <span className="block text-sm text-ink-soft mb-1">{label}</span>}
      <input
        type="text"
        inputMode="decimal"
        defaultValue={defaultValue}
        onKeyDown={(e) => {
          // Enter в числовом поле не должен молча сабмитить многополевую форму
          if (e.key === "Enter") e.preventDefault();
        }}
        onInput={(e) => {
          const el = e.currentTarget;
          const cleaned = el.value.replace(/[^\d.,]/g, "");
          if (cleaned !== el.value) el.value = cleaned;
        }}
        className={`w-full h-11 px-3 bg-paper border border-line rounded-tag text-ink font-mono-nums placeholder:text-ink-soft/60 focus:border-ink ${className}`}
        {...rest}
      />
    </label>
  );
}

// Ценник-плашка — второй мотив системы: бумажный ярлык с дыркой под нитку.
export function PriceTag({
  title,
  price,
  sub,
  accent = "ink",
  onClick,
  className = "",
  children,
}: {
  title: ReactNode;
  price?: ReactNode;
  sub?: ReactNode;
  accent?: "ink" | "stamp" | "fresh" | "warn";
  onClick?: () => void;
  className?: string;
  children?: ReactNode;
}) {
  const accentColor = {
    ink: "text-ink",
    stamp: "text-stamp",
    fresh: "text-fresh",
    warn: "text-warn",
  }[accent];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`relative text-left bg-paper-2 border border-line rounded-tag pl-6 pr-3 py-2.5 ${
        onClick ? "hover:border-ink transition-colors active:scale-[0.99]" : ""
      } ${className}`}
    >
      {/* дырка под нитку */}
      <span className="absolute left-2 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-paper border border-line" aria-hidden />
      <div className="flex items-baseline gap-2">
        <span className="font-medium leading-tight flex-1">{title}</span>
        {price != null && <span className={`font-mono-nums font-semibold ${accentColor}`}>{price}</span>}
      </div>
      {sub && <div className="text-xs text-ink-soft mt-0.5">{sub}</div>}
      {children}
    </Tag>
  );
}

export function Badge({ tone = "line", children }: { tone?: "line" | "stamp" | "fresh" | "warn"; children: ReactNode }) {
  const tones: Record<string, string> = {
    line: "bg-paper-2 text-ink-soft border-line",
    stamp: "bg-stamp/10 text-stamp border-stamp/30",
    fresh: "bg-fresh/10 text-fresh border-fresh/30",
    warn: "bg-warn/10 text-warn border-warn/40",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${tones[tone]}`}>
      {children}
    </span>
  );
}
