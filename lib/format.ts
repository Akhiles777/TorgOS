// Форматирование денег/веса. Prisma.Decimal приходит строкой/объектом —
// работаем через строку, чтобы не терять копейки во float.

import type { Unit } from "@prisma/client";

export function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return Number(v.toString());
}

// Числовые поля форм — принимаем и точку, и запятую (привычный ввод на
// русской раскладке). Нативный <input type="number"> запятую не пускает
// и молча обнуляет значение — отсюда «не сохраняется цена». Поля с этим
// парсером — обычный текст с inputMode="decimal", без такого подвоха.
export function parseRuNumber(v: FormDataEntryValue | null): number {
  if (v == null) return 0;
  const n = parseFloat(String(v).trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// «1234.5» → «1 234,50 ₽»
export function money(v: unknown): string {
  const n = toNum(v);
  const [int, frac = "00"] = n.toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${grouped},${frac} ₽`;
}

// Только число, без ₽ — для колонок ленты
export function money0(v: unknown): string {
  const n = toNum(v);
  const [int, frac = "00"] = n.toFixed(2).split(".");
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${frac}`;
}

// Количество: штуки без дробей, вес/объём — до 3 знаков без хвостовых нулей.
// G/ML/L — единицы ингредиентов в рецептах общепита (см. RecipeLine),
// розничные Product всегда PCS/KG.
export function qty(v: unknown, unit: Unit): string {
  const n = toNum(v);
  if (unit === "PCS") return String(Math.round(n));
  return n.toFixed(3).replace(/\.?0+$/, "").replace(".", ",");
}

export function unitLabel(unit: Unit): string {
  switch (unit) {
    case "KG": return "кг";
    case "G": return "г";
    case "ML": return "мл";
    case "L": return "л";
    default: return "шт";
  }
}

export function dateShort(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

// «17 июля 2026» — для мест, где дату читает человек, а не сверяет глазами
// таблицу (лендинг, письма, /billing/expired). В плотных списках/таблицах
// (например /root) короткая числовая dateShort — то, что нужно там, не эта.
export function dateLong(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export function timeShort(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

// Множественное число: plural(2, 'товар','товара','товаров')
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
