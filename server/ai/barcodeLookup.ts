// Определение товара по штрихкоду. Штрихкод сам по себе не содержит названия —
// это просто номер в базе GS1, поэтому без поиска в интернете его не узнать.
// Отсюда модель по умолчанию — perplexity/sonar-pro-search (ищет в сети);
// обычные «знающие» модели тут галлюцинируют, придумывая правдоподобные, но
// неверные названия. Живая проверка: sonar-pro-search находит реальные товары
// и честно отвечает found:false на несуществующий код, claude-sonnet вместо
// JSON начинал рассуждать вслух.
import { chatComplete, AiUnavailableError } from "./routerai";

const DEFAULT_MODEL = "perplexity/sonar-pro-search";
// Поиск в сети — это несколько секунд на запрос; замеры дали 5-7с, но под
// параллельной нагрузкой роутер отвечал и дольше, поэтому запас больше
// стандартных 25с из routerai.ts.
const TIMEOUT_MS = 45_000;
// Сколько штрихкодов ищем одновременно. Пачку из 20 позиций разбирает
// примерно за 4 волны — быстро, но роутер не захлёбывается.
const CONCURRENCY = 5;

export type BarcodeLookupResult =
  | { barcode: string; found: true; name: string; category: string }
  | { barcode: string; found: false; error: string };

export class BarcodeLookupError extends Error {}

function buildSystem(categories: string[]): string {
  const catLine = categories.length
    ? `category — по возможности одна из уже используемых в этом магазине: ${categories.join(", ")}. Если ни одна не подходит по смыслу — придумай короткую свою (1-2 слова).`
    : "category — короткая товарная категория на русском (1-2 слова).";
  return (
    "Ты определяешь товар по штрихкоду EAN-13/EAN-8 для магазина в России. " +
    "Найди в интернете, какому товару принадлежит этот штрихкод. " +
    'Верни СТРОГО JSON без пояснений и markdown: {"name":"...","category":"...","found":true|false}. ' +
    "name — как пишут на ценнике: бренд + наименование + объём/вес. " +
    catLine +
    ' Если достоверно определить не удалось — верни {"name":"","category":"","found":false}. ' +
    "Не выдумывай товар: неверное название хуже, чем честное «не найдено»."
  );
}

// Модель иногда оборачивает JSON в пояснения или ```-блок — вынимаем первый
// объект по фигурным скобкам, а не надеемся на чистый ответ.
function extractJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const candidates = [cleaned];
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(cleaned.slice(start, end + 1));
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // пробуем следующий вариант
    }
  }
  return null;
}

// Модель просили отвечать found:false, но она может вернуть found:true и
// отписку в name («не удалось определить», «unknown»). Ловим и это — товар с
// таким названием в базе никому не нужен.
const JUNK = /^(не\s|unknown|n\/?a$|нет данных|неизвест|not found|не найден|отсутств)/i;

export async function lookupBarcode(barcode: string, categories: string[]): Promise<BarcodeLookupResult> {
  const model = process.env.ROUTERAI_BARCODE_MODEL || DEFAULT_MODEL;
  let raw: string;
  try {
    raw = await chatComplete(
      [{ role: "system", content: buildSystem(categories) }, { role: "user", content: `Штрихкод: ${barcode}` }],
      { model, maxTokens: 300, timeoutMs: TIMEOUT_MS },
    );
  } catch (e) {
    if (e instanceof AiUnavailableError) return { barcode, found: false, error: "ИИ недоступен" };
    throw e;
  }

  const parsed = extractJson(raw);
  if (!parsed) return { barcode, found: false, error: "Непонятный ответ ИИ" };

  const name = String(parsed.name ?? "").trim();
  const category = String(parsed.category ?? "").trim();
  if (parsed.found === false || !name || JUNK.test(name)) {
    return { barcode, found: false, error: "Не нашли в сети" };
  }
  return { barcode, found: true, name, category: category || "Прочее" };
}

// Пачка штрихкодов — по одному запросу на код (так качество заметно выше, чем
// когда просишь модель разобрать список за раз), но волнами по CONCURRENCY.
export async function lookupBarcodes(barcodes: string[], categories: string[]): Promise<BarcodeLookupResult[]> {
  const results: BarcodeLookupResult[] = [];
  for (let i = 0; i < barcodes.length; i += CONCURRENCY) {
    const wave = barcodes.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(
      wave.map(async (code): Promise<BarcodeLookupResult> => {
        try {
          return await lookupBarcode(code, categories);
        } catch (e) {
          console.error("barcode lookup failed", code, e);
          return { barcode: code, found: false, error: "Сбой поиска" };
        }
      }),
    );
    results.push(...settled);
  }
  return results;
}
