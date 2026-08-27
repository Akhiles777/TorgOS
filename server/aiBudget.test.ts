import { describe, it, expect, beforeEach } from "vitest";
import { reserveAiLookups, AiBudgetError, __resetAiBudget } from "./ai/aiBudget";

describe("предохранитель расходов на ИИ", () => {
  beforeEach(() => __resetAiBudget());

  it("пропускает запросы в пределах часового лимита", () => {
    expect(() => reserveAiLookups("store-1", 40)).not.toThrow();
    expect(() => reserveAiLookups("store-1", 200)).not.toThrow();
    expect(() => reserveAiLookups("store-1", 60)).not.toThrow(); // ровно 300
  });

  it("отклоняет превышение и подсказывает, когда повторить", () => {
    reserveAiLookups("store-1", 300);
    expect(() => reserveAiLookups("store-1", 1)).toThrow(AiBudgetError);
    try {
      reserveAiLookups("store-1", 1);
    } catch (e) {
      expect((e as Error).message).toMatch(/через \d+ мин/);
    }
  });

  it("считает точки независимо — перерасход одной не блокирует другую", () => {
    reserveAiLookups("store-1", 300);
    expect(() => reserveAiLookups("store-2", 10)).not.toThrow();
  });

  it("не списывает лимит частично: отклонённая пачка не увеличивает счётчик", () => {
    reserveAiLookups("store-1", 299);
    expect(() => reserveAiLookups("store-1", 40)).toThrow(AiBudgetError);
    // единица всё ещё должна пройти — значит, отклонённые 40 не записались
    expect(() => reserveAiLookups("store-1", 1)).not.toThrow();
  });
});
