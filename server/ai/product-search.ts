// ИИ-поиск товара по нечёткому/ошибочному запросу кассира. Модели дают список
// всех товаров точки (id + название + категория) и запрос — она возвращает id
// самых подходящих. Ничего не выдумывает: выбирает ТОЛЬКО из присланных id.
// При недоступности ИИ возвращаем [] (касса просто покажет «не найдено»).
import type { TenantDb } from "../tenant";
import { chatComplete, AiUnavailableError } from "./routerai";

export async function aiFindProducts(db: TenantDb, storeId: string, query: string): Promise<string[]> {
  const q = query.trim();
  if (!q) return [];
  const products = await db.product.findMany({
    where: { storeId, isActive: true },
    select: { id: true, name: true, category: true },
    orderBy: { name: "asc" },
  });
  if (products.length === 0) return [];

  // Нумеруем, чтобы модель возвращала короткие индексы, а не длинные id.
  const list = products.map((p, i) => `${i}. ${p.name} [${p.category}]`).join("\n");
  const system =
    "Ты помогаешь кассиру найти товар в списке магазина по запросу с опечатками, " +
    "сокращениями или на слух. Верни СТРОГО JSON-массив НОМЕРОВ (индексов) до 6 самых " +
    "подходящих товаров, от лучшего к худшему, например [3,17,5]. Только номера из списка, " +
    "без пояснений. Если ничего не подходит — верни [].";
  const user = `Запрос кассира: "${q}"\n\nСписок товаров:\n${list}`;

  try {
    const raw = await chatComplete([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    const idx = JSON.parse(cleaned);
    if (!Array.isArray(idx)) return [];
    const ids: string[] = [];
    for (const n of idx) {
      const i = Number(n);
      if (Number.isInteger(i) && products[i]) ids.push(products[i].id);
    }
    return ids.slice(0, 6);
  } catch (e) {
    if (!(e instanceof AiUnavailableError)) console.error("aiFindProducts error", e);
    return [];
  }
}
