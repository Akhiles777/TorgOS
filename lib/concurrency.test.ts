import { describe, it, expect } from "vitest";
import { runWithConcurrency } from "./concurrency";

describe("runWithConcurrency", () => {
  it("сохраняет порядок результатов независимо от времени выполнения", async () => {
    const items = [50, 10, 30, 5, 20];
    const results = await runWithConcurrency(items, 3, (ms) => new Promise((r) => setTimeout(() => r(ms), ms)));
    expect(results).toEqual(items);
  });

  it("не превышает лимит одновременных вызовов", async () => {
    let active = 0;
    let maxActive = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    await runWithConcurrency(items, 3, async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
    });
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it("лимит больше числа элементов — не падает", async () => {
    const results = await runWithConcurrency([1, 2], 10, async (n) => n * 2);
    expect(results).toEqual([2, 4]);
  });

  it("пустой список — пустой результат", async () => {
    const results = await runWithConcurrency<number, number>([], 3, async (n) => n);
    expect(results).toEqual([]);
  });

  it("пробрасывает ошибку воркера", async () => {
    await expect(runWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    })).rejects.toThrow("boom");
  });
});
