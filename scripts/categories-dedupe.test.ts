// Разбор ответа модели: она предлагает, но решает код. Всё, чего нет во
// входном списке, отбрасывается — придуманных категорий в базе быть не должно.
import { describe, it, expect } from "vitest";
import { parseGroups } from "./categories-dedupe";

const known = ["крупа", "Крупы", "Сок", "соки", "Вода"];

describe("разбор групп категорий", () => {
  it("берёт группу, где все написания известны", () => {
    const out = parseGroups('[{"canonical":"Крупы","members":["крупа","Крупы"]}]', known);
    expect(out).toEqual([{ canonical: "Крупы", members: ["крупа", "Крупы"] }]);
  });

  it("не принимает выдуманную категорию", () => {
    // «Бакалея» в магазине нет — модель придумала её сама.
    expect(parseGroups('[{"canonical":"Бакалея","members":["крупа","Крупы"]}]', known)).toEqual([]);
  });

  it("выбрасывает членов, которых нет в списке", () => {
    const out = parseGroups('[{"canonical":"Сок","members":["Сок","соки","компот"]}]', known);
    expect(out[0].members).toEqual(["Сок", "соки"]);
  });

  it("одиночку группой не считает", () => {
    expect(parseGroups('[{"canonical":"Вода","members":["Вода"]}]', known)).toEqual([]);
  });

  it("одна категория не попадает в две группы", () => {
    const out = parseGroups(
      '[{"canonical":"Крупы","members":["крупа","Крупы"]},{"canonical":"Сок","members":["крупа","Сок"]}]',
      known,
    );
    expect(out).toHaveLength(1);
    expect(out[0].canonical).toBe("Крупы");
  });

  it("мусор вместо JSON не роняет разбор", () => {
    expect(parseGroups("не могу помочь", known)).toEqual([]);
    expect(parseGroups("[{сломанный json", known)).toEqual([]);
  });

  it("текст вокруг JSON не мешает", () => {
    const out = parseGroups('Вот результат:\n[{"canonical":"Сок","members":["Сок","соки"]}]\nготово', known);
    expect(out).toHaveLength(1);
  });
});
