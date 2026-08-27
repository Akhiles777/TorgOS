import { describe, it, expect } from "vitest";
import { describeGs1 } from "./gs1Prefix";

describe("расшифровка префикса GS1 (офлайн, без ИИ)", () => {
  it("узнаёт российский код", () => {
    const r = describeGs1("4607001943785");
    expect(r.hint).toContain("России");
    expect(r.internal).toBe(false);
  });

  it("узнаёт другие страны", () => {
    expect(describeGs1("5449000000996").hint).toContain("Бельгии"); // Coca-Cola Services, Брюссель
    expect(describeGs1("3017620422003").hint).toContain("Франции"); // Ferrero
    expect(describeGs1("6901234567892").hint).toContain("Китае");
    expect(describeGs1("4820000000005").hint).toContain("Украине");
  });

  it("помечает внутренний код магазина — его нет смысла искать в интернете", () => {
    const r = describeGs1("2000000000046");
    expect(r.internal).toBe(true);
    expect(r.hint).toBeNull();
  });

  it("отличает книги и периодику", () => {
    expect(describeGs1("9785171234562").publication).toBe(true);
    expect(describeGs1("9771234567898").publication).toBe(true);
    expect(describeGs1("4607001943785").publication).toBe(false);
  });

  it("не падает на мусоре и коротких кодах", () => {
    expect(describeGs1("").hint).toBeNull();
    expect(describeGs1("abc").hint).toBeNull();
    expect(describeGs1("123").hint).toBeNull();
    expect(describeGs1("46070019").hint).toContain("EAN-8");
  });

  it("неизвестный диапазон не выдумывает страну", () => {
    expect(describeGs1("1990000000004").hint).toBeNull();
  });
});
