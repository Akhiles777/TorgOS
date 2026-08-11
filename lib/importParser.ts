// Разбор и нормализация выгрузки номенклатуры — чистые функции, без DOM/Node
// специфики (TextDecoder есть в обоих окружениях), поэтому один и тот же код
// работает и в браузере (мгновенный предпросмотр), и как источник истины на
// сервере (см. отчёт по фиче — сервер НЕ пересчитывает из сырых ячеек заново,
// а принимает то, что показано пользователю в предпросмотре/поправлено).
//
// Философия из брифа: грязные данные — не повод падать или блокировать импорт.
// Единственное, что реально блокирует строку — отсутствие названия. Всё
// остальное (невалидный штрихкод, нераспознанная цена/дата) — предупреждение,
// строка всё равно импортируется.
import { isValidBarcode } from "./ean13";

export type FieldKey = "name" | "barcode" | "price" | "costPrice" | "unit" | "category" | "expiry" | "stock";

export type ColumnMapping = Partial<Record<FieldKey, number>>;

export type RowIssue = { field: FieldKey; message: string; severity: "error" | "warning" };

export type ParsedProductRow = {
  name: string;
  barcode: string | null;
  price: number;
  costPrice: number;
  unit: "PCS" | "KG";
  category: string;
  expiry: string | null;
  stock: number;
  issues: RowIssue[];
  skip: boolean;
  skipReason: string | null;
};

export const FIELD_LABELS: Record<FieldKey, string> = {
  name: "Название",
  barcode: "Штрихкод",
  price: "Цена продажи",
  costPrice: "Закупочная цена",
  unit: "Единица",
  category: "Категория",
  expiry: "Срок годности",
  stock: "Остаток",
};

// ── Кодировка CSV ──────────────────────────────────────────────────────────
// cp1251 встречается в реальных выгрузках чаще, чем utf-8. Фолбэк: если
// строгий utf-8 не смог декодировать байты — значит это windows-1251.
export function decodeCsvBuffer(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1251").decode(buffer);
  }
}

// ── Строка заголовков ────────────────────────────────────────────────────
// Эвристика, не точная наука: часть строк над шапкой (название компании,
// дата выгрузки) обычно короче и содержит меньше "табличных" ячеек, чем
// реальная шапка. Даёт хорошее первое приближение — UI должен предлагать
// ручной оверрайд, если эвристика ошиблась.
export function detectHeaderRowIndex(rows: string[][], maxScan = 20): number {
  const scanLimit = Math.min(maxScan, rows.length);
  let bestIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < scanLimit; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const nonEmpty = row.filter((c) => String(c ?? "").trim() !== "");
    if (nonEmpty.length < 2) continue;
    const nonEmptyRatio = nonEmpty.length / row.length;
    const textCount = nonEmpty.filter((c) => !/^-?\d+([.,]\d+)?$/.test(String(c).trim())).length;
    const textRatio = textCount / nonEmpty.length;
    let score = nonEmptyRatio * 0.5 + textRatio * 0.5;

    // Бонус, если следующая строка по числу непустых ячеек похожа на эту —
    // значит, под ней действительно таблица, а не разовая заголовочная строка.
    const next = rows[i + 1];
    if (next) {
      const nextNonEmpty = next.filter((c) => String(c ?? "").trim() !== "").length;
      if (Math.abs(nextNonEmpty - nonEmpty.length) <= 2) score += 0.2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// ── Цена/количество ──────────────────────────────────────────────────────
// Разделитель тысяч и десятичный разделитель определяем по тому, какой из
// них встречается ПОСЛЕДНИМ в строке — это верно и для "1 234,56", и для
// "1,234.56", без жёстко зашитого предположения об одном формате.
export function normalizePrice(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/(₽|руб\.?|rub)/gi, "").replace(/[\s ]/g, "");
  if (!s) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    s = s.replace(/,/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

// ── Единица измерения ────────────────────────────────────────────────────
const UNIT_ALIASES: Record<string, "PCS" | "KG"> = {
  "шт": "PCS", "штука": "PCS", "штук": "PCS", "pcs": "PCS", "ед": "PCS", "единица": "PCS",
  "кг": "KG", "килограмм": "KG", "килограммы": "KG", "kg": "KG", "г": "KG", "гр": "KG", "грамм": "KG", "граммы": "KG",
};

export function normalizeUnit(raw: string | null | undefined): "PCS" | "KG" {
  const key = String(raw ?? "").trim().toLowerCase().replace(/\.+$/, "");
  return UNIT_ALIASES[key] ?? "PCS";
}

// ── Штрихкод ──────────────────────────────────────────────────────────────
// Восстанавливает то, что чаще всего ломает Excel: научная нотация у больших
// чисел (4.60703E+12) и потерянный ОДИН ведущий ноль у EAN-13/EAN-8.
export function recoverBarcode(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/[\s ]/g, "");
  if (!s) return null;

  if (/^\d+([.,]\d+)?e\+?\d+$/i.test(s)) {
    const n = Number(s.replace(",", "."));
    if (Number.isFinite(n)) s = Math.round(n).toString();
  }
  s = s.replace(/\D/g, "");
  if (!s) return null;

  if (s.length === 12) s = "0" + s;
  else if (s.length === 7) s = "0" + s;
  return s;
}

// ── Срок годности ────────────────────────────────────────────────────────
export function normalizeExpiry(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  let m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }

  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }

  // Excel хранит дату как число дней с 30.12.1899 — попадает сюда, если
  // столбец с датой не был отформатирован как дата при экспорте.
  if (/^\d{4,6}$/.test(s)) {
    const serial = Number(s);
    if (serial >= 20000 && serial <= 80000) {
      const date = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
      if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
    }
  }

  return null;
}

// ── Заголовки → поля модели (работает и без пресета) ───────────────────────
const AUTO_ALIASES: Record<FieldKey, string[]> = {
  name: ["наименование", "название", "товар", "номенклатура", "name"],
  barcode: ["штрихкод", "штрих-код", "barcode", "ean", "ean13", "ean-13", "код товара"],
  price: ["цена", "цена продажи", "розничная цена", "цена розн", "price", "цена, руб"],
  costPrice: ["закупочная цена", "себестоимость", "цена закупки", "закупка", "costprice", "цена поставщика"],
  unit: ["единица", "ед. изм", "ед изм", "единица измерения", "unit", "ед"],
  category: ["категория", "группа", "раздел", "category", "группа товаров"],
  expiry: ["срок годности", "годен до", "expiry", "срок реализации"],
  stock: ["остаток", "количество", "кол-во", "stock", "остаток, шт"],
};

export function normalizeHeader(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.:]+$/, "");
}

function matchAliases(normalizedHeaders: string[], aliases: string[]): number | undefined {
  for (const alias of aliases) {
    const idx = normalizedHeaders.indexOf(normalizeHeader(alias));
    if (idx !== -1) return idx;
  }
  return undefined;
}

export function autoMapColumns(headers: string[]): ColumnMapping {
  const normalized = headers.map(normalizeHeader);
  const mapping: ColumnMapping = {};
  for (const field of Object.keys(AUTO_ALIASES) as FieldKey[]) {
    const idx = matchAliases(normalized, AUTO_ALIASES[field]);
    if (idx !== undefined) mapping[field] = idx;
  }
  return mapping;
}

export function applyPreset(headers: string[], presetColumns: Partial<Record<FieldKey, string[]>>): ColumnMapping {
  const mapping = autoMapColumns(headers);
  const normalized = headers.map(normalizeHeader);
  for (const field of Object.keys(presetColumns) as FieldKey[]) {
    const idx = matchAliases(normalized, presetColumns[field] ?? []);
    if (idx !== undefined) mapping[field] = idx;
  }
  return mapping;
}

// ── Разбор одной строки ─────────────────────────────────────────────────
const SUBTOTAL_RE = /^(итого|итог|всего|total|subtotal)[:.\s-]*$/i;

function cell(raw: string[], mapping: ColumnMapping, field: FieldKey): string {
  const idx = mapping[field];
  if (idx == null) return "";
  return String(raw[idx] ?? "").trim();
}

// seenBarcodes копится вызывающим кодом по ходу всего файла — так дубли
// штрихкода ловятся между строками, а не только внутри одной.
export function parseRow(raw: string[], mapping: ColumnMapping, seenBarcodes: Set<string>): ParsedProductRow {
  const issues: RowIssue[] = [];
  const name = cell(raw, mapping, "name");

  if (!name || SUBTOTAL_RE.test(name)) {
    return {
      name, barcode: null, price: 0, costPrice: 0, unit: "PCS", category: "", expiry: null, stock: 0,
      issues, skip: true, skipReason: !name ? "нет названия" : "похоже на строку-подытог",
    };
  }

  const priceRaw = cell(raw, mapping, "price");
  const priceParsed = normalizePrice(priceRaw);
  if (priceRaw && priceParsed === null) issues.push({ field: "price", message: "цена не распознана, поставили 0", severity: "warning" });
  else if (!priceRaw) issues.push({ field: "price", message: "цена не указана", severity: "warning" });

  const costRaw = cell(raw, mapping, "costPrice");
  const costParsed = costRaw ? normalizePrice(costRaw) : 0;
  if (costRaw && costParsed === null) issues.push({ field: "costPrice", message: "закупочная цена не распознана, поставили 0", severity: "warning" });

  let barcode = recoverBarcode(cell(raw, mapping, "barcode"));
  if (barcode) {
    if (!isValidBarcode(barcode)) issues.push({ field: "barcode", message: "не проходит проверку контрольной цифры EAN", severity: "warning" });
    if (seenBarcodes.has(barcode)) {
      issues.push({ field: "barcode", message: "дубль штрихкода внутри файла — строка пропущена", severity: "error" });
      return {
        name, barcode, price: priceParsed ?? 0, costPrice: costParsed ?? 0,
        unit: normalizeUnit(cell(raw, mapping, "unit")), category: cell(raw, mapping, "category") || "Прочее",
        expiry: normalizeExpiry(cell(raw, mapping, "expiry")), stock: normalizePrice(cell(raw, mapping, "stock")) ?? 0,
        issues, skip: true, skipReason: "дубль штрихкода внутри файла",
      };
    }
    seenBarcodes.add(barcode);
  }

  const expiryRaw = cell(raw, mapping, "expiry");
  const expiry = normalizeExpiry(expiryRaw);
  if (expiryRaw && expiry === null) issues.push({ field: "expiry", message: "дата не распознана, оставили пустой", severity: "warning" });

  const stockRaw = cell(raw, mapping, "stock");
  const stock = stockRaw ? (normalizePrice(stockRaw) ?? 0) : 0;

  return {
    name,
    barcode,
    price: priceParsed ?? 0,
    costPrice: costParsed ?? 0,
    unit: normalizeUnit(cell(raw, mapping, "unit")),
    category: cell(raw, mapping, "category") || "Прочее",
    expiry,
    stock,
    issues,
    skip: false,
    skipReason: null,
  };
}
