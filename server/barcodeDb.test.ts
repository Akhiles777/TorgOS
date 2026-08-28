import { describe, it, expect } from "vitest";
import { parseBarcodeListHtml, tidyDbName, guessCategory, namesAgree } from "./services/barcodeDb";

// Разметка — сокращённая копия реальной страницы barcode-list.ru
// (проверено на живых штрихкодах владельца 4690326205195 / 4680088479224).
const HTML = `
<html><body>
<table class="main_table">
  <tr><th>№</th><th>Штрих-код</th><th>Наименование</th><th>Единица измерения</th><th>Рейтинг*</th></tr>
  <tr><td>1</td><td>4690326205195</td><td>ТЕТР 12Л КОСАЯ . МОИ ЗАНЯТИЯ.</td><td>ШТ.</td><td>6</td></tr>
  <tr><td>2</td><td>4690326205195</td><td>ТЕТРАДЬ 12 ЛИСТОВ В АССОРТИМЕНТЕ (ТВЕРДАЯ)</td><td>ШТ.</td><td>9</td></tr>
  <tr><td>3</td><td>9999999999999</td><td>ЧУЖОЙ ТОВАР ИЗ ДРУГОГО БЛОКА</td><td>КГ</td><td>99</td></tr>
</table>
</body></html>`;

describe("разбор справочника штрихкодов", () => {
  it("вынимает названия и единицу, отсортированные по достоверности", () => {
    const rows = parseBarcodeListHtml(HTML, "4690326205195");
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("ТЕТРАДЬ 12 ЛИСТОВ В АССОРТИМЕНТЕ (ТВЕРДАЯ)"); // рейтинг 9 выше
    expect(rows[0].unit).toBe("PCS");
    expect(rows[0].rating).toBe(9);
  });

  it("не подхватывает строки с чужим штрихкодом", () => {
    const rows = parseBarcodeListHtml(HTML, "4690326205195");
    expect(rows.some((r) => r.name.includes("ЧУЖОЙ"))).toBe(false);
  });

  it("на странице без таблицы результатов возвращает пусто, а не падает", () => {
    expect(parseBarcodeListHtml("<html><body>ничего не найдено</body></html>", "4690326205195")).toEqual([]);
    expect(parseBarcodeListHtml("", "4690326205195")).toEqual([]);
  });
});

describe("локальное приведение названия (без ИИ)", () => {
  it("раскрывает сокращения и убирает артикул поставщика", () => {
    expect(tidyDbName("ТЕТР 96Л МИКС7922")).toBe("Тетрадь 96 л микс");
    expect(tidyDbName("ОБЩ ТЕТР 96 Л")).toBe("Общая тетрадь 96 л");
  });

  it("отделяет число от единицы", () => {
    expect(tidyDbName("ТЕТР 12Л")).toBe("Тетрадь 12 л");
  });

  it("сохраняет латинские марки", () => {
    expect(tidyDbName('ТЕТРАДЬ 12Л., BG "UNITONE"')).toContain("BG");
  });

  it("не ломается на пустой и странной строке", () => {
    expect(tidyDbName("")).toBe("");
    expect(tidyDbName("   ")).toBe("   ");
    expect(tidyDbName("Т5СК12")).toBe("Т5СК12"); // из одних артикулов — отдаём как было
  });
});

// resolveCategory не экспортируется наружу — проверяем поведение через
// публичный контракт в barcodeLookup нельзя без сети, поэтому здесь только
// то, что можно проверить чисто. Само правило «слабая модель коверкает
// названия категорий» закрыто выбором категории по номеру (см. barcodeLookup).

describe("категория по названию (словарь, без ИИ)", () => {
  it("узнаёт основные группы магазина", () => {
    expect(guessCategory("Кока-кола ж.б 0.33 л")).toBe("Напитки");
    expect(guessCategory("Тетрадь 96 листов")).toBe("Канцелярия");
    expect(guessCategory("Порошок стиральный автомат 3 кг")).toBe("Бытовая химия");
    expect(guessCategory("Творог домашний 5%")).toBe("Молочное и сыры");
    expect(guessCategory("Лаваш тонкий")).toBe("Выпечка");
  });

  it("подставляет написание категории, которое уже есть в магазине", () => {
    expect(guessCategory("Кока-кола 0.33", ["напитки", "Бакалея"])).toBe("напитки");
  });

  it("молчит, когда не уверен — лучше «Прочее», чем неверная категория", () => {
    expect(guessCategory("Ерунда без опознавательных знаков")).toBeNull();
    expect(guessCategory("")).toBeNull();
  });
});

describe("варианты из разных источников", () => {
  it("убирает отдельно стоящий артикул, но сохраняет количество", () => {
    expect(tidyDbName("7326 ТЕТРАДЬ ШКОЛЬНАЯ А5 12Л")).toBe("Тетрадь школьная а5 12 л");
    expect(tidyDbName("ТЕТРАДЬ 12 ЛИСТОВ")).toBe("Тетрадь 12 листов");
  });

  it("считает совпадением разные написания одного названия", () => {
    expect(namesAgree("Ferrero Nutella паста 400 г", "Nutella паста ореховая 400 г")).toBe(true);
    expect(namesAgree("Тетрадь 12 листов", "Порошок стиральный 3 кг")).toBe(false);
    expect(namesAgree("", "Тетрадь")).toBe(false);
  });
});
