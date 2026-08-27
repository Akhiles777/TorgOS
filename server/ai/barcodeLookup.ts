// Определение товара по штрихкоду. Штрихкод сам по себе не содержит названия —
// это просто номер в базе GS1, поэтому без поиска в интернете его не узнать.
// Отсюда модель — из линейки Perplexity (ищет в сети); обычные «знающие» LLM
// тут галлюцинируют, придумывая правдоподобные, но неверные названия.
//
// Почему поиск устроен в два захода. Первая версия отвечала «не найдено» на
// целые товарные группы — канцелярию, бытовую химию. Разбор причин дал три:
//  1. Промпт сам склонял к отказу («неверное название хуже, чем честное
//     не найдено») — модель отказывалась даже там, где знала производителя.
//  2. Модель не знала, ГДЕ искать: российская непродовольственная мелочь
//     живёт на маркетплейсах и в рунет-базах, а не в международных каталогах.
//  3. Дешёвый sonar делает один неглубокий заход и на этом останавливается.
// Соответственно: промпт требует ответа с градацией уверенности вместо
// отказа, подсказывает источники и страну по префиксу GS1 (бесплатно,
// офлайн), а по-настоящему не найденные позиции — и только они — уходят на
// второй, более сильный заход.
import { chatComplete, AiUnavailableError } from "./routerai";
import { describeGs1 } from "@/lib/gs1Prefix";
import { lookupBarcodeDb, tidyDbName, pickBestEntry, guessCategory, type BarcodeDbEntry } from "@/server/services/barcodeDb";

// Причёсывание названия из справочника. Веб-поиск тут не нужен — товар уже
// известен, надо лишь превратить «ТЕТР 12Л КОСАЯ . МОИ ЗАНЯТИЯ.» в строку для
// ценника. Поэтому берём дешёвую текстовую модель: по прайсу роутера она
// примерно в 20 раз дешевле поисковой на том же объёме.
// Замеры на живых данных: ультрадешёвые модели (nova-micro, mistral-nemo,
// gpt-oss-20b) либо возвращали пустой ответ, либо уходили в таймаут на 20с.
// gpt-5-mini отвечает стабильно и заметно лучше — и всё равно дешевле
// поисковой sonar, при том что поиск мы вообще не запускаем.
const MODEL_TIDY = "openai/gpt-5-mini";
const TIDY_TIMEOUT_MS = 25_000;

// Первый заход: самая дешёвая модель с веб-поиском.
const MODEL_FAST = "perplexity/sonar";
// Второй заход — только для того, что первый не нашёл. Дороже, поэтому
// применяется к меньшинству позиций и общий счёт растёт незначительно.
const MODEL_DEEP = "perplexity/sonar-pro";
const TIMEOUT_MS = 45_000;
const CONCURRENCY = 5;
// Потолок на «дорогие» повторы в одной пачке — предохранитель от ситуации,
// когда пользователь загнал 40 несуществующих кодов и каждый пошёл на второй
// круг. Остальные честно вернут «не найдено» после первого захода.
const MAX_ESCALATIONS = 15;
// Потолок на список категорий в промпте: у большого магазина их могут быть
// десятки, и каждая уходит в оплачиваемые входные токены на КАЖДЫЙ штрихкод.
const MAX_CATEGORY_HINTS = 20;

export type Confidence = "high" | "low";

export type BarcodeLookupResult =
  // known — товар уже есть в каталоге точки, название взято из базы, а не у ИИ.
  // Вызывающий показывает это отдельно: сохранить такую строку всё равно
  // нельзя (дубль штрихкода), и лучше сказать об этом до нажатия «Сохранить».
  | {
      barcode: string; found: true; name: string; category: string; confidence: Confidence;
      // Единица из справочника, если он её знает (ШТ./КГ) — не надо угадывать.
      unit?: "PCS" | "KG" | null;
      // Откуда взято: бесплатный справочник, платный поиск или своя база.
      source?: "db" | "web" | "own";
      known?: true;
    }
  | { barcode: string; found: false; error: string };

export class BarcodeLookupError extends Error {}

// Категория, названная моделью словами, приводится к канонической: слабые
// модели переставляют буквы («Урбеч и мёд» → «Буровая и мёд») и засоряют
// справочник почти-дубликатами. Совпадение без учёта регистра и пробелов —
// берём написание из базы; иначе принимаем как новую, но короткую.
function resolveCategory(raw: string, categories: string[]): string {
  const clean = raw.trim().replace(/\s+/g, " ");
  if (!clean) return "Прочее";
  const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[^а-яa-z0-9]/gi, "");
  const hit = categories.find((c) => norm(c) === norm(clean));
  return hit ?? clean.slice(0, 40);
}

function categoryLine(categories: string[]): string {
  // Категории приходят из БД точки — их пишет человек, поэтому режем и по
  // количеству, и по длине: длинная строка раздувает платный промпт, а заодно
  // это отсекает попытку «подсунуть» модели инструкцию через название категории.
  const hints = categories
    .map((c) => c.trim().replace(/\s+/g, " ").slice(0, 40))
    .filter(Boolean)
    .slice(0, MAX_CATEGORY_HINTS);
  return hints.length
    ? `category — по возможности одна из уже используемых в этом магазине: ${hints.join(", ")}. Если ни одна не подходит по смыслу — придумай короткую свою (1-2 слова).`
    : "category — короткая товарная категория на русском (1-2 слова).";
}

function buildSystem(categories: string[], deep: boolean): string {
  return [
    "Ты определяешь товар по штрихкоду EAN-13/EAN-8 для магазина в России.",
    "Найди в интернете, какому товару принадлежит этот номер.",
    // Куда смотреть. Без этого модель ищет в международных каталогах, где
    // российской канцелярии и бытовой химии просто нет.
    "Где искать: российские маркетплейсы (Wildberries, Ozon, Яндекс Маркет), сайты сетей (Комус, Читай-город, Магнит, Лента), базы штрихкодов (barcode-list.ru, eandata.com, opengtindb), сайт производителя.",
    deep
      ? "Первый, поверхностный поиск уже ничего не дал — ищи глубже: пробуй номер в кавычках, вместе со словами «штрихкод», «EAN», «купить», «артикул», ищи и на английском."
      : "",
    // Главное ограничение. Промпт-предшественник склонял к отказу и терял
    // целые товарные группы; слишком мягкая формулировка, наоборот, заставила
    // модель ВЫДУМЫВАТЬ бренд по стране префикса (на коде Ariel она выдала
    // «Barilla»). Верное правило посередине: отвечать разрешено только по
    // источникам, где встречается сам номер.
    "ЖЁСТКОЕ ПРАВИЛО: отвечай только на основании источников, в которых встречается САМ ЭТОТ НОМЕР. Если номер не встретился нигде — found:false. Никогда не выводи бренд или товар из страны префикса, из похожих номеров или из общих знаний — это выдумка, она недопустима.",
    "Если номер найден, но источник даёт лишь производителя или группу товара, а не точный вариант — верни то, что реально написано в источнике, и укажи confidence:\"low\". Не дополняй его догадками.",
    'confidence: "high" — источник даёт конкретный товар; "low" — источник найден, но наименование неполное.',
    "name — как пишут на ценнике: бренд + наименование + объём/вес/количество.",
    categoryLine(categories),
    'Ответ — СТРОГО один JSON-объект без пояснений и markdown: {"name":"...","category":"...","confidence":"high"|"low","found":true|false}.',
    'found:false ставь, только если не нашёл вообще ничего — ни товара, ни производителя, ни типа.',
  ]
    .filter(Boolean)
    .join(" ");
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
const JUNK = /^(не\s|unknown|n\/?a$|нет данных|неизвест|not found|не найден|отсутств|товар не)/i;

async function askModel(barcode: string, categories: string[], deep: boolean): Promise<BarcodeLookupResult> {
  const gs1 = describeGs1(barcode);
  const userLines = [`Штрихкод: ${barcode}`];
  // Страна — подсказка, ГДЕ искать, и ничего больше. Без этой оговорки модель
  // принимала её за факт о товаре и придумывала бренд «подходящей» страны.
  if (gs1.hint) userLines.push(`${gs1.hint} Это подсказка для выбора источников поиска, а не сведение о товаре.`);

  const model = deep
    ? process.env.ROUTERAI_BARCODE_MODEL_DEEP || MODEL_DEEP
    : process.env.ROUTERAI_BARCODE_MODEL || MODEL_FAST;

  let raw: string;
  try {
    raw = await chatComplete(
      [
        { role: "system", content: buildSystem(categories, deep) },
        { role: "user", content: userLines.join("\n") },
      ],
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
  return {
    barcode,
    found: true,
    name,
    // resolveCategory: если модель назвала существующую категорию с иным
    // написанием — подставляем то, что уже в базе, чтобы не плодить дубли.
    // Если категории не дала вовсе — пробуем угадать по названию словарём.
    category: category ? resolveCategory(category, categories) : (guessCategory(name, categories) ?? "Прочее"),
    confidence: parsed.confidence === "high" ? "high" : "low",
  };
}

// Справочник отдаёт несколько вариантов написания одного товара в магазинном
// сокращённом виде. Просим дешёвую модель выбрать самый полный и разложить его
// в человеческое название + категорию. Если модель недоступна — не теряем
// находку: отдаём лучший вариант справочника как есть, человек поправит.
async function tidyFromDb(
  barcode: string,
  entries: BarcodeDbEntry[],
  categories: string[],
  useAi: boolean,
): Promise<BarcodeLookupResult> {
  const best = pickBestEntry(entries) ?? entries[0];
  // Локальный результат готов всегда и мгновенно — он же ответ для кассы.
  // Категорию угадываем словарём: без него товар из справочника уходил в
  // «Прочее» даже когда по названию всё очевидно («Кока-кола» → Напитки).
  const localName = tidyDbName(best.name);
  const local: BarcodeLookupResult = {
    barcode, found: true, name: localName,
    category: guessCategory(localName, categories) ?? "Прочее",
    confidence: "high", unit: best.unit, source: "db",
  };
  if (!useAi) return local;
  const list = entries.slice(0, 6).map((e, i) => `${i + 1}. ${e.name}`).join("\n");
  // Категорию просим НОМЕРОМ из списка, а не строкой: живой прогон показал,
  // что дешёвая модель переписывает название категории с ошибками
  // («Урбеч и мёд» → «Буровая и мёд») и плодит мусор в справочнике.
  const catList = categories.slice(0, MAX_CATEGORY_HINTS);
  const numbered = catList.map((c, i) => `${i}. ${c}`).join("\n");

  const system = [
    "Ты приводишь в порядок название товара для ценника в российском магазине.",
    "На вход — варианты одного и того же товара из базы штрихкодов, записанные сокращённо и капсом разными магазинами.",
    "Выбери самый полный и понятный, раскрой сокращения (ТЕТР → Тетрадь, Л → листов, ОБЩ → Общая, КЛ → клетка), приведи к обычному регистру.",
    "Не добавляй того, чего нет в вариантах: не выдумывай бренд, объём или цвет.",
    "Убери артикулы и коды вида «Т5СК12 7326», если без них название остаётся понятным.",
    catList.length
      ? `Категория: выбери НОМЕР подходящей из списка магазина и верни его в categoryIndex. Если ни одна не подходит по смыслу — верни categoryIndex: null и короткое своё название (1-2 слова) в newCategory. Номера категорий:\n${numbered}`
      : "Категорию верни в newCategory: короткая, 1-2 слова, categoryIndex: null.",
    'Ответ — строго один JSON: {"name":"...","categoryIndex":число_или_null,"newCategory":"..."}.',
  ].join(" ");

  try {
    const raw = await chatComplete(
      [{ role: "system", content: system }, { role: "user", content: `Варианты названия:\n${list}` }],
      // Короткий таймаут: товар уже найден, причёсывание — необязательное
      // улучшение. Лучше отдать локально приведённое название сразу, чем
      // держать кассира у экрана (замер поймал ответ модели на 38-й секунде).
      { model: process.env.ROUTERAI_BARCODE_MODEL_TIDY || MODEL_TIDY, maxTokens: 200, timeoutMs: TIDY_TIMEOUT_MS },
    );
    const parsed = extractJson(raw);
    const name = String(parsed?.name ?? "").trim();
    if (parsed && name && !JUNK.test(name)) {
      // Осторожно с null: Number(null) === 0, и «категория не подошла»
      // молча превращалось в первую категорию списка (тетради попадали в
      // «Бакалею»). Поэтому отсутствие индекса проверяем до приведения к числу.
      const rawIdx = parsed.categoryIndex;
      const idx = rawIdx === null || rawIdx === undefined || rawIdx === "" ? NaN : Number(rawIdx);
      const category = Number.isInteger(idx) && idx >= 0 && idx < catList.length
        ? catList[idx]
        : resolveCategory(String(parsed.newCategory ?? ""), categories);
      return {
        barcode,
        found: true,
        // Модель нередко отвечает со строчной буквы — приводим к виду ценника.
        name: name.charAt(0).toUpperCase() + name.slice(1),
        category,
        // high: товар реально найден в справочнике по этому самому номеру.
        confidence: "high",
        unit: best.unit,
        source: "db",
      };
    }
  } catch {
    // молча падаем на локально приведённое название
  }
  return local;
}

// tidy=false — режим кассы: у кассира стоит покупатель, ждать модель нельзя.
// Название из справочника приводится локальными правилами за миллисекунды,
// человек при желании поправит его прямо в форме. tidy=true — режим админки,
// где пачку разбирают заранее и лишние секунды не мешают.
export async function lookupBarcode(
  barcode: string,
  categories: string[],
  opts: { tidy?: boolean } = {},
): Promise<BarcodeLookupResult> {
  const useAiTidy = opts.tidy ?? true;
  // Внутренний код магазина (префикс 2) в интернете искать бессмысленно — его
  // выдал этот же магазин для развесного товара. Экономим платный запрос.
  const gs1 = describeGs1(barcode);
  if (gs1.internal) {
    return { barcode, found: false, error: "Внутренний код магазина — впишите название сами" };
  }

  // Шаг 1 — бесплатный справочник. Для российских товаров срабатывает чаще
  // всего и стоит 0 ₽; платный поиск дальше уже не нужен.
  const db = await lookupBarcodeDb(barcode);
  if (db.length) return tidyFromDb(barcode, db, categories, useAiTidy);

  // Шаг 2 — платный поиск в интернете.
  const fast = await askModel(barcode, categories, false);
  if (fast.found) return { ...fast, source: "web" };
  // Шаг 3 — один более глубокий заход по тому, что не нашлось.
  const deep = await askModel(barcode, categories, true);
  return deep.found ? { ...deep, source: "web" } : deep;
}

// Пачка штрихкодов — по одному запросу на код (так качество заметно выше, чем
// когда просишь модель разобрать список за раз), но волнами по CONCURRENCY.
export async function lookupBarcodes(barcodes: string[], categories: string[]): Promise<BarcodeLookupResult[]> {
  const results: BarcodeLookupResult[] = [];
  let escalations = 0;

  for (let i = 0; i < barcodes.length; i += CONCURRENCY) {
    const wave = barcodes.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(
      wave.map(async (code): Promise<BarcodeLookupResult> => {
        try {
          const gs1 = describeGs1(code);
          if (gs1.internal) {
            return { barcode: code, found: false, error: "Внутренний код магазина — впишите название сами" };
          }
          // Бесплатный справочник первым — на российской номенклатуре он
          // закрывает большую часть пачки, не потратив ни копейки.
          const db = await lookupBarcodeDb(code);
          if (db.length) return tidyFromDb(code, db, categories, true);

          const fast = await askModel(code, categories, false);
          if (fast.found) return { ...fast, source: "web" };
          // Второй заход — пока не исчерпан лимит дорогих повторов на пачку.
          if (escalations >= MAX_ESCALATIONS) return fast;
          escalations++;
          const deep = await askModel(code, categories, true);
          return deep.found ? { ...deep, source: "web" } : deep;
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
