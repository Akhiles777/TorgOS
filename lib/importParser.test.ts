import { describe, it, expect } from "vitest";
import {
  normalizePrice, normalizeUnit, recoverBarcode, normalizeExpiry,
  detectHeaderRowIndex, autoMapColumns, applyPreset, parseRow, type ColumnMapping,
} from "./importParser";

describe("normalizePrice", () => {
  it("парсит обычную цену с точкой", () => expect(normalizePrice("199.90")).toBe(199.9));
  it("запятая как десятичный разделитель", () => expect(normalizePrice("199,90")).toBe(199.9));
  it("пробел как разделитель тысяч + запятая", () => expect(normalizePrice("1 234,56")).toBe(1234.56));
  it("неразрывный пробел как разделитель тысяч", () => expect(normalizePrice("1 234,56")).toBe(1234.56));
  it("знак ₽ и точка", () => expect(normalizePrice("199,90 ₽")).toBe(199.9));
  it("рубли текстом", () => expect(normalizePrice("450 руб.")).toBe(450));
  it("точка как десятичный + запятая как тысячи (US-формат)", () => expect(normalizePrice("1,234.56")).toBe(1234.56));
  it("пусто → null", () => expect(normalizePrice("")).toBeNull());
  it("мусор → null", () => expect(normalizePrice("н/д")).toBeNull());
  it("отрицательная цена → null (не бывает)", () => expect(normalizePrice("-100")).toBeNull());
});

describe("normalizeUnit", () => {
  it.each([
    ["шт", "PCS"], ["шт.", "PCS"], ["штука", "PCS"], ["ШТ", "PCS"], ["pcs", "PCS"],
    ["кг", "KG"], ["кг.", "KG"], ["килограмм", "KG"], ["КГ", "KG"], ["kg", "KG"], ["г", "KG"], ["гр.", "KG"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeUnit(raw)).toBe(expected);
  });
  it("неизвестное → PCS по умолчанию", () => expect(normalizeUnit("бочка")).toBe("PCS"));
  it("пусто → PCS по умолчанию", () => expect(normalizeUnit("")).toBe("PCS"));
});

describe("recoverBarcode", () => {
  it("восстанавливает научную нотацию", () => expect(recoverBarcode("4.60703E+12")).toBe("4607030000000"));
  it("восстанавливает потерянный ведущий ноль (EAN-13, 12 цифр)", () => {
    expect(recoverBarcode("460123456789")).toBe("0460123456789");
  });
  it("восстанавливает потерянный ведущий ноль (EAN-8, 7 цифр)", () => {
    expect(recoverBarcode("4601234")).toBe("04601234");
  });
  it("полный EAN-13 не трогает", () => expect(recoverBarcode("4600123456789")).toBe("4600123456789"));
  it("убирает пробелы внутри", () => expect(recoverBarcode("4 600123 456789")).toBe("4600123456789"));
  it("пусто → null", () => expect(recoverBarcode("")).toBeNull());
  it("null → null", () => expect(recoverBarcode(null)).toBeNull());
});

describe("normalizeExpiry", () => {
  it("dd.mm.yyyy", () => expect(normalizeExpiry("17.07.2026")).toBe("2026-07-17"));
  it("dd/mm/yyyy", () => expect(normalizeExpiry("17/07/2026")).toBe("2026-07-17"));
  it("yyyy-mm-dd", () => expect(normalizeExpiry("2026-07-17")).toBe("2026-07-17"));
  it("Excel-серийная дата", () => expect(normalizeExpiry("46220")).toBe("2026-07-17"));
  it("мусор → null", () => expect(normalizeExpiry("скоро")).toBeNull());
  it("пусто → null", () => expect(normalizeExpiry("")).toBeNull());
});

describe("detectHeaderRowIndex", () => {
  it("находит шапку сразу, если она первая строка", () => {
    const rows = [
      ["Наименование", "Штрихкод", "Цена"],
      ["Молоко 3.2%", "4600123456789", "89.90"],
      ["Хлеб бородинский", "4600987654321", "45.00"],
    ];
    expect(detectHeaderRowIndex(rows)).toBe(0);
  });

  it("пропускает служебные строки над шапкой (название компании, дата выгрузки)", () => {
    const rows = [
      ["ООО Ромашка"],
      ["Выгрузка от 01.08.2026"],
      [],
      ["Наименование", "Штрихкод", "Цена", "Ед."],
      ["Молоко 3.2%", "4600123456789", "89.90", "шт"],
      ["Хлеб бородинский", "4600987654321", "45.00", "шт"],
      ["Сыр Российский", "4600111222333", "650.00", "кг"],
    ];
    expect(detectHeaderRowIndex(rows)).toBe(3);
  });
});

describe("autoMapColumns / applyPreset", () => {
  it("сопоставляет по стандартным русским заголовкам без пресета", () => {
    const headers = ["Наименование", "Штрихкод", "Цена продажи", "Закупочная цена", "Ед. изм", "Категория"];
    const mapping = autoMapColumns(headers);
    expect(mapping).toEqual({ name: 0, barcode: 1, price: 2, costPrice: 3, unit: 4, category: 5 });
  });

  it("пресет переопределяет автоопределение при совпадении заголовка", () => {
    const headers = ["Товар", "Код товара", "Розничная цена"];
    const mapping = applyPreset(headers, { name: ["товар"], barcode: ["код товара"] });
    expect(mapping.name).toBe(0);
    expect(mapping.barcode).toBe(1);
    expect(mapping.price).toBe(2); // подхвачено автоопределением, не пресетом
  });
});

describe("parseRow", () => {
  const mapping: ColumnMapping = { name: 0, barcode: 1, price: 2, costPrice: 3, unit: 4, category: 5, expiry: 6, stock: 7 };

  it("разбирает нормальную строку без замечаний", () => {
    const seen = new Set<string>();
    const row = parseRow(["Молоко 3.2%", "4600123456782", "89,90", "60", "шт", "Молочка", "17.07.2026", "12"], mapping, seen);
    expect(row).toMatchObject({ name: "Молоко 3.2%", barcode: "4600123456782", price: 89.9, costPrice: 60, unit: "PCS", category: "Молочка", expiry: "2026-07-17", stock: 12, skip: false });
    expect(row.issues).toHaveLength(0);
  });

  it("пустая строка пропускается (нет названия)", () => {
    const seen = new Set<string>();
    const row = parseRow(["", "", "", "", "", "", "", ""], mapping, seen);
    expect(row.skip).toBe(true);
    expect(row.skipReason).toBe("нет названия");
  });

  it("строка-подытог пропускается", () => {
    const seen = new Set<string>();
    const row = parseRow(["Итого:", "", "125000", "", "", "", "", ""], mapping, seen);
    expect(row.skip).toBe(true);
    expect(row.skipReason).toBe("похоже на строку-подытог");
  });

  it("товар без штрихкода не отбрасывается", () => {
    const seen = new Set<string>();
    const row = parseRow(["Пирожок с повидлом", "", "45", "20", "шт", "Выпечка", "", ""], mapping, seen);
    expect(row.skip).toBe(false);
    expect(row.barcode).toBeNull();
  });

  it("невалидный штрихкод — предупреждение, но не пропуск", () => {
    const seen = new Set<string>();
    const row = parseRow(["Тест", "1234567890123", "10", "5", "шт", "", "", ""], mapping, seen);
    expect(row.skip).toBe(false);
    expect(row.barcode).toBe("1234567890123");
    expect(row.issues.some((i) => i.field === "barcode" && i.severity === "warning")).toBe(true);
  });

  it("дубль штрихкода внутри файла — вторая строка пропускается", () => {
    const seen = new Set<string>();
    const first = parseRow(["Товар А", "4600123456789", "10", "5", "шт", "", "", ""], mapping, seen);
    const second = parseRow(["Товар Б (тот же штрихкод)", "4600123456789", "20", "10", "шт", "", "", ""], mapping, seen);
    expect(first.skip).toBe(false);
    expect(second.skip).toBe(true);
    expect(second.skipReason).toBe("дубль штрихкода внутри файла");
  });

  it("нераспознанная цена — 0 и предупреждение, строка не блокируется", () => {
    const seen = new Set<string>();
    const row = parseRow(["Товар", "", "неизвестно", "5", "шт", "", "", ""], mapping, seen);
    expect(row.skip).toBe(false);
    expect(row.price).toBe(0);
    expect(row.issues.some((i) => i.field === "price")).toBe(true);
  });

  it("восстанавливает штрихкод в научной нотации прямо в потоке разбора", () => {
    const seen = new Set<string>();
    const row = parseRow(["Товар", "4.60703E+12", "10", "5", "шт", "", "", ""], mapping, seen);
    expect(row.barcode).toBe("4607030000000");
  });
});
