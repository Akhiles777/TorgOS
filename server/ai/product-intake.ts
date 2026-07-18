// ИИ-приёмка товара: свободный текст («пришло 20 бутылок Рычал-Су по 75,
// 5 кг сахара по 60») → структурированный список позиций. Модель также
// сопоставляет позиции с уже существующими товарами (чтобы приход шёл на них,
// а не плодил дубли). Ничего критичного не считает сама — суммы/остатки
// пересчитываются на сервере; список даётся пользователю на проверку и правку
// ПЕРЕД сохранением.
import type { TenantDb } from "../tenant";
import { chatComplete, AiUnavailableError } from "./routerai";
import { toNum } from "@/lib/format";

export type IntakeItem = {
  name: string;
  quantity: number;
  unit: "PCS" | "KG";
  price: number; // цена продажи
  costPrice: number; // себестоимость (0 если не указана — уточнит человек)
  category: string;
  matchedProductId: string | null; // существующий товар, если узнан
  matchedName?: string; // его название (для показа «приход к: …»)
};

export class IntakeError extends Error {}

export async function parseIntake(db: TenantDb, storeId: string, text: string): Promise<IntakeItem[]> {
  const clean = text.trim();
  if (clean.length < 3) throw new IntakeError("Опишите, какой товар пришёл и сколько");

  const products = await db.product.findMany({
    where: { storeId },
    select: { id: true, name: true, unit: true, price: true, category: true },
    orderBy: { name: "asc" },
  });
  const catalogue = products.map((p, i) => `${i}. ${p.name} [${p.category}] (${p.unit === "KG" ? "кг" : "шт"}, ${toNum(p.price)}₽)`).join("\n");

  const system =
    "Ты — помощник по приёмке товара в магазине. Из свободного текста извлеки список позиций. " +
    "Верни СТРОГО валидный JSON-массив без markdown, каждый элемент вида: " +
    '{"name":"...","quantity":число,"unit":"PCS"|"KG","price":число_цена_продажи,"costPrice":число_себестоимость_или_0,"category":"...","match":индекс_из_каталога_или_null}. ' +
    "unit=KG если товар вешают (кг, граммы), иначе PCS. Если позиция явно совпадает с товаром из каталога — укажи его индекс в match, " +
    "иначе null и предложи разумную категорию. Если цена/себестоимость не названы — ставь 0. Количество обязательно. " +
    "Не придумывай лишних позиций. Отвечай только JSON-массивом.";
  const user = `Текст приёмки:\n"${clean}"\n\nКаталог магазина (индекс. название):\n${catalogue || "(пусто)"}`;

  let raw: string;
  try {
    raw = await chatComplete([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
  } catch (e) {
    if (e instanceof AiUnavailableError) throw new IntakeError("ИИ недоступен, попробуйте позже или добавьте товар вручную");
    throw e;
  }

  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new IntakeError("Не удалось разобрать ответ ИИ. Переформулируйте проще.");
  }
  if (!Array.isArray(parsed)) throw new IntakeError("ИИ не нашёл товаров в тексте");

  const items: IntakeItem[] = [];
  for (const r of parsed as Record<string, unknown>[]) {
    if (!r || typeof r !== "object") continue;
    const name = String(r.name ?? "").trim();
    const quantity = Number(r.quantity);
    if (!name || !Number.isFinite(quantity) || quantity <= 0) continue;
    const matchIdx = r.match == null ? null : Number(r.match);
    const matched = matchIdx != null && Number.isInteger(matchIdx) ? products[matchIdx] : undefined;
    items.push({
      name: matched ? matched.name : name,
      quantity: Math.round(quantity * 1000) / 1000,
      unit: r.unit === "KG" || matched?.unit === "KG" ? "KG" : "PCS",
      price: matched ? toNum(matched.price) : Math.max(0, Number(r.price) || 0),
      costPrice: Math.max(0, Number(r.costPrice) || 0),
      category: matched ? matched.category : String(r.category ?? "Прочее").trim() || "Прочее",
      matchedProductId: matched?.id ?? null,
      matchedName: matched?.name,
    });
  }
  if (items.length === 0) throw new IntakeError("ИИ не нашёл товаров в тексте");
  return items;
}
