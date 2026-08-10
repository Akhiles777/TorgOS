// Чистая функция, без БД — синтетические входные данные, проверяем
// severity/сортировку/пороговые случаи. По аналогии с server/pos.test.ts
// и server/tenant.test.ts, но этому тесту живая БД не нужна.
import { describe, it, expect } from "vitest";
import { generatePlatformInsights, type PlatformInsightInput } from "./platform";

const BASE: PlatformInsightInput = {
  windowDays: 30,
  scrollCompletionThisWeek: 40,
  scrollCompletionLastWeek: 40,
  ctaClicksWindow: 0,
  signupsWindow: 0,
  trialToPaidRecent: { converted: 0, total: 0 },
  trialToPaidOlder: { converted: 0, total: 0 },
  stuckOnboarding: [],
  inactivePaying: [],
};

describe("generatePlatformInsights", () => {
  it("ничего не сообщает, когда всё в порядке и данных мало", () => {
    expect(generatePlatformInsights(BASE)).toEqual([]);
  });

  it("флагает падение долистывания лендинга", () => {
    const out = generatePlatformInsights({ ...BASE, scrollCompletionThisWeek: 20, scrollCompletionLastWeek: 40 });
    expect(out.some((i) => i.title.includes("Меньше долистывают"))).toBe(true);
    expect(out[0].severity).toBe("danger"); // падение 20пп >= 15 → danger
  });

  it("не флагает небольшие колебания долистывания", () => {
    const out = generatePlatformInsights({ ...BASE, scrollCompletionThisWeek: 38, scrollCompletionLastWeek: 40 });
    expect(out.some((i) => i.title.includes("Меньше долистывают"))).toBe(false);
  });

  it("показывает клики/регистрации рядом, без выдуманного % конверсии кликов", () => {
    const out = generatePlatformInsights({ ...BASE, ctaClicksWindow: 12, signupsWindow: 3 });
    const insight = out.find((i) => i.title.includes("Клики"));
    expect(insight).toBeDefined();
    expect(insight!.body).not.toMatch(/%\s*(кликнувших|конверси)/i);
    expect(insight!.metric).toBe("12 кликов / 3 регистраций");
  });

  it("флагает падение конверсии триал→оплата", () => {
    const out = generatePlatformInsights({
      ...BASE,
      trialToPaidRecent: { converted: 1, total: 10 }, // 10%
      trialToPaidOlder: { converted: 5, total: 10 }, // 50%
    });
    const insight = out.find((i) => i.title.includes("конверсия"));
    expect(insight).toBeDefined();
    expect(insight!.severity).toBe("danger"); // разрыв 40пп >= 25 → danger
  });

  it("агрегирует застрявшие на онбординге организации в одну карточку", () => {
    const out = generatePlatformInsights({
      ...BASE,
      stuckOnboarding: [
        { orgName: "Магазин А", daysSinceSignup: 5 },
        { orgName: "Магазин Б", daysSinceSignup: 3 },
      ],
    });
    const insight = out.find((i) => i.title.includes("застряли"));
    expect(insight).toBeDefined();
    expect(insight!.metric).toBe("2 без единого товара");
    expect(insight!.severity).toBe("warn"); // меньше 5 → warn, не danger
  });

  it("сортирует по severity: danger перед warn перед info", () => {
    const out = generatePlatformInsights({
      ...BASE,
      ctaClicksWindow: 5,
      signupsWindow: 2, // info
      stuckOnboarding: [{ orgName: "Тест", daysSinceSignup: 3 }], // warn
      trialToPaidRecent: { converted: 0, total: 10 },
      trialToPaidOlder: { converted: 5, total: 10 }, // danger
    });
    const severities = out.map((i) => i.severity);
    expect(severities).toEqual([...severities].sort((a, b) => ({ danger: 0, warn: 1, info: 2 })[a] - ({ danger: 0, warn: 1, info: 2 })[b]));
    expect(severities[0]).toBe("danger");
  });
});
