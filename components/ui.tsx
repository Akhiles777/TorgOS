// Свои базовые компоненты (без UI-китов). Всё из токенов.
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import Link, { type LinkProps } from "next/link";

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

// То же, что Button, но рендерит next/link — для CTA, ведущих на другую
// страницу (лендинг → /register), где нужна навигация, а не onClick.
export function LinkButton({
  variant = "ghost",
  size = "md",
  className = "",
  children,
  ...rest
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> &
  LinkProps & { variant?: BtnVariant; size?: "md" | "lg" | "xl" }) {
  return (
    <Link className={`${btnBase} ${btnSizes[size]} ${btnVariants[variant]} ${className}`} {...rest}>
      {children}
    </Link>
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
//
// Работает и неуправляемым (defaultValue, как раньше), и управляемым (value +
// onValueChange) — второе нужно для полей, зависящих друг от друга (например,
// себестоимость, которая сама считается от цены, пока её не тронули руками).
export function DecimalField({
  label,
  className = "",
  defaultValue,
  value,
  onValueChange,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> & {
  label?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  const controlled = value !== undefined;
  return (
    <label className="block">
      {label && <span className="block text-sm text-ink-soft mb-1">{label}</span>}
      <input
        type="text"
        inputMode="decimal"
        {...(controlled ? { value } : { defaultValue })}
        onKeyDown={(e) => {
          // Enter в числовом поле не должен молча сабмитить многополевую форму
          if (e.key === "Enter") e.preventDefault();
        }}
        onChange={(e) => {
          const cleaned = e.currentTarget.value.replace(/[^\d.,]/g, "");
          onValueChange?.(cleaned);
          // В неуправляемом режиме чистим значение прямо в DOM (как раньше);
          // в управляемом — этим занимается родитель через value.
          if (!controlled && cleaned !== e.currentTarget.value) e.currentTarget.value = cleaned;
        }}
        className={`w-full h-11 px-3 bg-paper border border-line rounded-tag text-ink font-app-mono placeholder:text-ink-soft/60 focus:border-ink ${className}`}
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
    stamp: "text-stamp-text",
    fresh: "text-fresh-text",
    warn: "text-warn-text",
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
        {price != null && <span className={`font-app-mono font-semibold ${accentColor}`}>{price}</span>}
      </div>
      {sub && <div className="text-xs text-ink-soft mt-0.5">{sub}</div>}
      {children}
    </Tag>
  );
}

export function Badge({ tone = "line", children }: { tone?: "line" | "stamp" | "fresh" | "warn"; children: ReactNode }) {
  const tones: Record<string, string> = {
    line: "bg-paper-2 text-ink-soft border-line",
    stamp: "bg-stamp/10 text-stamp-text border-stamp/30",
    fresh: "bg-fresh/10 text-fresh-text border-fresh/30",
    warn: "bg-warn/10 text-warn-text border-warn/40",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${tones[tone]}`}>
      {children}
    </span>
  );
}

// Карточка — заменяет ~10 рукописных `bg-paper-2 border border-line rounded-tag p-*`
// по admin/owner с расходящимся паддингом.
export function Card({
  pad = "md",
  className = "",
  children,
}: {
  pad?: "sm" | "md";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`bg-paper-2 border border-line rounded-tag ${pad === "sm" ? "p-3" : "p-4"} ${className}`}>
      {children}
    </div>
  );
}

// Пустое состояние — единая версия вместо 5 копий с разным py-6/py-10.
export function EmptyState({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`text-ink-soft py-10 px-4 text-center bg-paper-2 border border-line rounded-tag leading-relaxed ${className}`}>
      {children}
    </div>
  );
}

// Переключатель-пилюля — заменяет 5 независимых копий одного и того же
// (фильтры товаров, долги открыт/погашен, единицы измерения ×2, тип движения).
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  fill = false,
  className = "",
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  size?: "md" | "cash";
  // Кнопки делят ширину контейнера поровну (2-3 варианта в ряд, как
  // радиогруппа) — раньше это пытались получить снаружи через `grid
  // grid-cols-N [&>button]:w-full`, что конфликтовало с display:flex
  // самого компонента и на деле схлопывало ряд в колонку.
  fill?: boolean;
  className?: string;
}) {
  const h = size === "cash" ? "h-14 px-4" : "h-9 px-3";
  return (
    <div className={`flex gap-2 ${fill ? "" : "inline-flex flex-wrap"} ${className}`} role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`${h} ${fill ? "flex-1" : ""} rounded-tag border text-sm font-medium transition-colors ${
            value === o.value ? "bg-ink text-paper border-ink" : "bg-paper border-line hover:bg-paper-2"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Базовая модалка — раньше жила как локальный Overlay в components/pos/WeightModal.tsx
// и параллельно была ещё раз вручную набрана в PaymentModal.tsx. Существующие
// использования переводятся на неё по ходу редизайна экранов, не все разом.
export function Modal({ children, onCancel }: { children: ReactNode; onCancel: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-ink/40 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      {/* max-w-full обязателен: содержимое модалок задаёт ширину во vw
          (w-[min(94vw,…)]), а эта обёртка добавляет к ней свой padding —
          на телефоне сумма выходила шире экрана и правый край формы
          обрезался. Ограничение по ширине контейнера чинит это разом для
          всех модалок; min-w-0 нужен, чтобы длинные строки внутри не
          распирали flex-элемент обратно. */}
      <div className="bg-paper rounded-tag border border-line shadow-2xl p-4 sm:p-6 my-auto max-h-[94dvh] max-w-full min-w-0 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

// Брендированное подтверждение необратимого действия — замена нативному
// confirm(), который единственный в проекте выпадает из фирменного стиля.
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Удалить",
  cancelLabel = "Отмена",
  danger = true,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <Modal onCancel={onCancel}>
      <div className="w-[min(92vw,380px)]">
        <h2 className="text-xl font-semibold">{title}</h2>
        {body && <p className="text-ink-soft text-sm mt-2">{body}</p>}
        <div className="grid grid-cols-2 gap-3 mt-5">
          <Button variant="line" size="lg" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "stamp" : "fresh"} size="lg" onClick={onConfirm} disabled={busy}>
            {busy ? "Секунду…" : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// Строка чека — общий паттерн «подпись … пунктир … сумма», сейчас
// передублирован вручную в Receipt.tsx, DebtsList, ReceiptsList. Поддерживает
// необязательный разворот (аккордеон) через onToggle/expanded/children.
export function ReceiptRow({
  label,
  value,
  sub,
  expanded,
  onToggle,
  children,
  className = "",
}: {
  label: ReactNode;
  value?: ReactNode;
  sub?: ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
  children?: ReactNode;
  className?: string;
}) {
  const row = (
    <div className="flex items-baseline">
      <span className="font-medium">{label}</span>
      <span className="leader" aria-hidden />
      {value != null && <span className="font-app-mono tabular-nums font-semibold shrink-0 text-right">{value}</span>}
      {onToggle && (
        <span className="text-ink-soft text-xs ml-2 shrink-0" aria-hidden>
          {expanded ? "▲" : "▾"}
        </span>
      )}
    </div>
  );
  return (
    <div className={`py-2.5 ${className}`}>
      {onToggle ? (
        <button type="button" onClick={onToggle} className="w-full text-left" aria-expanded={expanded}>
          {row}
        </button>
      ) : (
        row
      )}
      {sub && <div className="text-xs text-ink-soft mt-0.5">{sub}</div>}
      {expanded && children && (
        <div className="receipt border-t border-dashed border-line mt-2 pt-2">{children}</div>
      )}
    </div>
  );
}

// Табло — фирменный элемент редизайна: тёмная утопленная панель для
// самых важных чисел в системе (сумма, сдача, выручка). Не имитация
// светодиодного индикатора — просто окошко показаний, как на весах
// или старом кассовом аппарате. Используется скупо, по цели на экран.
export function ReadoutPanel({
  label,
  value,
  unit = "₽",
  tone = "paper",
  size = "lg",
  className = "",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: "paper" | "fresh" | "warn" | "stamp";
  size?: "lg" | "xl";
  className?: string;
}) {
  // fresh/warn/stamp обычные темнее ink — на тёмной панели неразличимы,
  // отсюда отдельные -on-dark варианты (см. globals.css).
  const digitColor = {
    paper: "text-paper",
    fresh: "text-[var(--color-fresh-on-dark)]",
    warn: "text-[var(--color-warn-on-dark)]",
    stamp: "text-[var(--color-stamp-on-dark)]",
  }[tone];
  const sizeCls = size === "xl" ? "text-6xl sm:text-7xl" : "text-4xl sm:text-5xl";
  return (
    <div className={`rounded-tag bg-ink px-5 py-4 ${className}`}>
      <div className="text-paper/55 uppercase tracking-wide text-xs mb-1">{label}</div>
      <div className={`font-app-display ${sizeCls} leading-none tabular-nums ${digitColor}`}>
        {value}
        {unit && <span className="text-[0.45em] ml-1.5 opacity-70">{unit}</span>}
      </div>
    </div>
  );
}
