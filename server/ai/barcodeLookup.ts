// ИИ-определение товара по штрихкоду: продавец вводит только штрихкод (плюс
// цену — отдельно, в форме) и просит модель угадать название и категорию.
// Штрихкод сам по себе не несёт названия — это просто число, поэтому ответ
// модели всегда нужно проверять и править человеку (см. вызывающий код:
// результат только предзаполняет форму, ничего не сохраняет сам).
import { chatComplete, AiUnavailableError } from "./routerai";

export type BarcodeLookupResult = { name: string; category: string };

export class BarcodeLookupError extends Error {}

export async function lookupBarcode(barcode: string, existingCategories: string[]): Promise<BarcodeLookupResult> {
  const categoriesHint = existingCategories.length
    ? ` Уже используемые в этом магазине категории (используй одну из них, если товар подходит по смыслу): ${existingCategories.join(", ")}.`
    : "";
  const system =
    "Ты — помощник продавца-консьержа магазина в России, определяешь товар по штрихкоду (EAN-13/EAN-8, стандарт GS1). " +
    "По номеру штрихкода определи наиболее вероятный товар: бренд, наименование, объём/вес упаковки, если это типовой товар FMCG. " +
    "Если не уверен на 100% — всё равно дай наиболее вероятный вариант, не отказывайся и не пиши отказ вместо названия. " +
    "Category — короткая товарная категория (1-2 слова)." + categoriesHint +
    ' Верни СТРОГО валидный JSON без markdown и пояснений: {"name":"...","category":"..."}. ' +
    'Если совсем никаких предположений нет — верни {"name":"","category":""}.';
  const user = `Штрихкод: ${barcode}`;

  let raw: string;
  try {
    raw = await chatComplete(
      [{ role: "system", content: system }, { role: "user", content: user }],
      { model: process.env.ROUTERAI_BARCODE_MODEL, maxTokens: 200 },
    );
  } catch (e) {
    if (e instanceof AiUnavailableError) throw new BarcodeLookupError("ИИ недоступен, заполните вручную");
    throw e;
  }

  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new BarcodeLookupError("Не удалось разобрать ответ ИИ, заполните вручную");
  }
  if (!parsed || typeof parsed !== "object") throw new BarcodeLookupError("Не удалось разобрать ответ ИИ, заполните вручную");

  const name = String((parsed as Record<string, unknown>).name ?? "").trim();
  const category = String((parsed as Record<string, unknown>).category ?? "").trim();
  if (!name) throw new BarcodeLookupError("Не удалось определить товар по этому штрихкоду, заполните вручную");
  return { name, category: category || "Прочее" };
}
