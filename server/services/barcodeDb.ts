// Бесплатный справочник штрихкодов barcode-list.ru — открытая база, которую
// наполняют сами магазины. Именно в ней лежит российская непродовольственная
// мелочь (канцелярия, бытовая химия, хозтовары), которой нет ни в
// международных каталогах, ни в поисковой выдаче: живая проверка на трёх
// реальных штрихкодах владельца показала, что ни обычный веб-поиск, ни поиск
// Wildberries их не знают, а этот справочник знает все три.
//
// Поэтому порядок в barcodeLookup.ts такой: сначала бесплатный справочник,
// платная модель с веб-поиском — только если справочник промолчал.

import { politeFetch, LookupUnavailableError } from "./politeFetch";

const ENDPOINT = "https://barcode-list.ru/barcode/RU/Поиск.htm";
const RU_HOST = "barcode-list.ru";
// Пауза между запросами к справочнику. Изначально стояло 120мс, и на разборе
// пачки в 30 позиций сайт переставал отвечать данными: он не выдаёт 429, а
// молча отдаёт ту же страницу с пустой таблицей. Со стороны это неотличимо от
// «такого товара нет» — именно так и терялась половина позиций в больших
// пачках. 600мс на позицию для фонового разбора незаметны, зато справочник
// продолжает отвечать.
const RU_GAP_MS = 600;
const TIMEOUT_MS = 12_000;
// Сутки: товарные названия в справочнике меняются крайне редко, а повторный
// скан того же штрихкода (пересорт, вторая поставка) — обычное дело.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// Пустой ответ чужого справочника — не факт, а мнение на сейчас: он мог быть
// перегружен. Держим такой ответ недолго, чтобы повтор через несколько минут
// имел шанс, и товар не считался несуществующим целые сутки.
const NEGATIVE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;

function ttlFor(empty: boolean): number {
  return empty ? NEGATIVE_TTL_MS : CACHE_TTL_MS;
}

export type BarcodeDbEntry = {
  name: string;
  // «ШТ.» / «КГ» из справочника — заодно избавляет от угадывания единицы.
  unit: "PCS" | "KG" | null;
  // Сколько магазинов сообщили это название: чем больше, тем достовернее.
  rating: number;
  // Какой источник дал запись. Совпадение из двух независимых источников —
  // сильный признак, что название верное (см. lookupFreeSources).
  origin: "ru" | "off";
};

const cache = new Map<string, { at: number; entries: BarcodeDbEntry[] }>();

// Магазинные сокращения из справочника. Только однозначные — «КР» может быть и
// «краски», и «красный», такие не трогаем: лучше оставить как есть, чем
// подставить неверное слово.
const ABBR: Record<string, string> = {
  ТЕТР: "тетрадь", ТЕТРАДЬ: "тетрадь", ОБЩ: "общая", ШК: "школьная", ШКОЛЬН: "школьная",
  КЛ: "клетка", КЛЕТ: "клетка", ЛИН: "линейка", АЛЬБ: "альбом", БУМ: "бумага",
  КАРАНД: "карандаш", РУЧ: "ручка", ПАП: "папка", ПЛАСТ: "пластиковая", ОБЛ: "обложка",
  АССОРТ: "ассорти", УП: "упаковка", НАБ: "набор", ДЕТ: "детский",
  "СР-ВО": "средство", СРВО: "средство", СРЕД: "средство", ЖИДК: "жидкость",
  ПОРОШ: "порошок", СТИР: "стиральный", ЧИСТ: "чистящее", УНИВ: "универсальное",
  МОЮЩ: "моющее", ГЕЛЬ: "гель", ШАМП: "шампунь", САЛФ: "салфетки", ПАК: "пакет",
};

// «96Л» → «96 л», «12Л.» → «12 л»: в справочнике число и единица слиты.
function splitUnits(token: string): string {
  return token.replace(/^(\d+)(Л|МЛ|Г|КГ|ШТ)\.?$/iu, (_, n: string, u: string) => `${n} ${u.toLowerCase()}`);
}

// Артикулы поставщика: «Т5СК12» — выбрасываем целиком, «МИКС7922» — срезаем
// цифровой хвост, но само слово оставляем (это часть названия). Возвращает
// null, если токен нужно убрать полностью.
function stripArticle(token: string): string | null {
  const t = token.replace(/[.,]/g, "");
  // Слово из 3+ букв с приклеенным номером: оставляем слово.
  const worded = t.match(/^([А-ЯЁA-Z]{3,})\d{3,}$/u);
  if (worded) return worded[1];
  // Короткая буквенная приставка с номером — не слово, это код.
  if (/^[А-ЯЁA-Z]{1,2}\d{3,}$/u.test(t)) return null;
  // Отдельно стоящее длинное число — артикул («7326 ТЕТРАДЬ ШКОЛЬНАЯ»).
  // Количества на ценнике короче: «12 листов», «0,33 л», «96 л».
  if (/^\d{4,}$/.test(t)) return null;
  // Смесь букв и цифр, начинающаяся с цифры внутри — тоже код (Т5СК12).
  if (/^[А-ЯЁA-Z]?\d[А-ЯЁA-Z\d]{4,}$/u.test(t)) return null;
  return token;
}

// Приведение названия из справочника к виду ценника — БЕЗ обращения к ИИ.
// Нужно по двум причинам: во-первых, это мгновенно и бесплатно; во-вторых,
// служит запасным вариантом, когда модель-причёсыватель недоступна или
// задумалась (живой замер поймал ответ на 38-й секунде).
export function tidyDbName(raw: string): string {
  const tokens = raw
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((t) => t.replace(/^[.,]+|[.,]+$/g, ""))
    .filter(Boolean)
    .map(stripArticle)
    .filter((t): t is string => t !== null)
    .map(splitUnits)
    .flatMap((t) => t.split(" "))
    .map((t) => {
      const key = t.toUpperCase().replace(/\.$/, "");
      if (ABBR[key]) return ABBR[key];
      // Слова капсом приводим к строчным; смешанный регистр и бренды в
      // кавычках («BG», «ШКОЛЬНАЯ») оставляем как есть только если это латиница
      // из 2-3 букв — обычно это марка.
      if (/^[A-Z]{2,3}$/.test(t)) return t;
      if (/^[А-ЯЁA-Z\d"'«».,-]+$/u.test(t)) return t.toLowerCase();
      return t;
    })
    .filter(Boolean);

  const joined = tokens.join(" ").replace(/\s+([.,])/g, "$1").trim();
  if (!joined) return raw;
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

function decode(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// Таблица результатов помечена class="main_table"; строки —
// [№, штрихкод, наименование, единица, рейтинг]. Сверяем штрихкод в строке с
// запрошенным, чтобы не подхватить строку из соседнего блока страницы.
export function parseBarcodeListHtml(html: string, barcode: string): BarcodeDbEntry[] {
  const table = html.match(/<table[^>]*class="main_table"[\s\S]*?<\/table>/i);
  if (!table) return [];

  const entries: BarcodeDbEntry[] = [];
  for (const row of table[0].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? []).map(decode);
    if (cells.length < 4) continue;
    if (cells[1] !== barcode) continue;

    const name = cells[2];
    if (!name || name.length < 3) continue;

    const rawUnit = (cells[3] || "").toUpperCase();
    const unit = rawUnit.startsWith("ШТ") ? "PCS" : rawUnit.startsWith("КГ") ? "KG" : null;
    const rating = Number.parseInt(cells[4] ?? "", 10);

    entries.push({ name, unit, rating: Number.isFinite(rating) ? rating : 0, origin: "ru" });
  }

  // Самые «подтверждённые» названия — первыми.
  return entries.sort((a, b) => b.rating - a.rating);
}

// Категория по названию — без ИИ и без денег. Нужна там, где модель не
// вызывается: на кассе товар из справочника иначе уходил в «Прочее», хотя по
// названию «Кока-кола ж.б 0.33 л» категория очевидна. Список намеренно
// короткий и однозначный: сомнительное слово лучше не угадывать.
const CATEGORY_WORDS: [RegExp, string][] = [
  [/тетрад|ручк|карандаш|альбом|пенал|линейк|ластик|точилк|дневник|папк|клей|фломастер|краск|пластилин|цирку|обложк|блокнот/iu, "Канцелярия"],
  [/порош|отбелив|чистящ|моющ|средств|гель для|шампун|мыло|кондиционер для|освежител|антисептик|пятновывод|domestos|fairy|ariel|tide|persil/iu, "Бытовая химия"],
  [/салфет|пакет|перчатк|губк|тряпк|фольг|пергамент|мусорн|швабр|веник|прищепк|зубочист/iu, "Хозтовары"],
  [/вода|сок|кола|лимонад|квас|морс|напиток|газирован|минерал|энергетик|pepsi|cola/iu, "Напитки"],
  [/чай|кофе|какао|цикори/iu, "Чай и кофе"],
  [/молок|кефир|сметан|творог|сыр|йогурт|ряженк|сливк|масло сливоч|брынз|сулугуни/iu, "Молочное и сыры"],
  [/хлеб|батон|лаваш|булк|лепёшк|лепешк|сушк|сухар|пирож|самса|чуду|выпечк/iu, "Выпечка"],
  [/конфет|шоколад|печень|вафл|пряник|мармелад|зефир|халв|пахлав|ирис|карамел|nutella|паста.*какао/iu, "Конфеты и сладости"],
  [/крупа|рис|гречк|макарон|мука|сахар|соль|масло подсолн|консерв|тушён|тушен|специ|приправ/iu, "Бакалея"],
  [/колбас|сосиск|сардельк|ветчин|бекон|фарш|мясо|курин|тушк/iu, "Мясное"],
  [/подгузник|памперс|прокладк|зубн|щётк|щетк|крем для|дезодорант|бритв|pampers|шампунь/iu, "Гигиена"],
];

// Возвращает категорию по названию. Если такая уже есть в магазине —
// отдаём её написание, чтобы не плодить «Напитки» и «напитки» рядом.
export function guessCategory(name: string, storeCategories: string[] = []): string | null {
  const hit = CATEGORY_WORDS.find(([re]) => re.test(name));
  if (!hit) return null;
  const guess = hit[1];
  const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[^а-яa-z0-9]/gi, "");
  return storeCategories.find((c) => norm(c) === norm(guess)) ?? guess;
}

// ── Второй бесплатный источник: Open Food Facts ──────────────────────────
// Международная открытая база (плюс её сёстры по косметике и непродовольствию).
// Закрывает ровно ту дыру, где российский справочник бессилен: импортная еда и
// косметика. Проверено вживую: Nutella и Coca-Cola там есть с брендом и
// объёмом, российской канцелярии нет — источники дополняют друг друга.
// Порядок важен: сначала продукты (самая полная база), потом косметика,
// потом непродовольственное. Идём по одному и останавливаемся на первом
// найденном — раньше опрашивались все три сразу, и на пачке это давало
// 15 одновременных запросов и шквал 429.
const OFF_HOSTS = [
  "world.openfoodfacts.org",
  "world.openbeautyfacts.org",
  "world.openproductsfacts.org",
];
// Open Food Facts просит не чаще ~100 запросов в минуту на product-эндпоинт.
// Держим заметный запас: живой замер ловил 429 даже на одиночных запросах.
const OFF_GAP_MS = 700;

type OffProduct = {
  product_name?: string;
  product_name_ru?: string;
  brands?: string;
  quantity?: string;
};

function offName(p: OffProduct): string {
  const base = (p.product_name_ru || p.product_name || "").trim();
  if (!base) return "";
  const brand = (p.brands || "").split(",")[0]?.trim() ?? "";
  const qty = (p.quantity || "").trim();
  const parts: string[] = [];
  // Бренд добавляем только если его ещё нет в названии — иначе выходит
  // «Nutella Nutella».
  if (brand && !base.toLowerCase().includes(brand.toLowerCase())) parts.push(brand);
  parts.push(base);
  if (qty && !base.toLowerCase().includes(qty.toLowerCase())) parts.push(qty);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

async function lookupOpenFacts(barcode: string): Promise<BarcodeDbEntry[]> {
  const fields = "product_name,product_name_ru,brands,quantity";
  let unavailable: unknown = null;

  for (const host of OFF_HOSTS) {
    try {
      const res = await politeFetch(
        host,
        `https://${host}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${fields}`,
        // User-Agent в формате, который просит Open Food Facts: имя, версия, контакт.
        { headers: { "User-Agent": "TorgOS/1.0 (https://torgos.ru)" } },
        // Open Food Facts при лимите отвечает 429 на всё подряд: быстро
        // признаём его недоступным, чтобы не тормозить разбор пачки.
        { minGapMs: OFF_GAP_MS, retries: 1, timeoutMs: TIMEOUT_MS, circuitAfter: 2, circuitCooldownMs: 5 * 60_000 },
      );
      if (res.status === 404) continue;
      if (!res.ok) continue;
      const data = (await res.json()) as { status?: number; product?: OffProduct };
      if (data.status !== 1 || !data.product) continue;
      const name = offName(data.product);
      // Нашли — дальше не ходим: остальные хосты этот товар всё равно не знают.
      if (name) return [{ name, unit: null, rating: 5, origin: "off" }];
    } catch (e) {
      // Запоминаем недоступность, но пробуем следующий хост.
      unavailable = e;
    }
  }
  if (unavailable instanceof LookupUnavailableError) throw unavailable;
  return [];
}

// Для сверки источников: «Nutella Ferrero 400 g» и «Ferrero Nutella, 400 г» —
// одно и то же. Сравниваем по набору значимых слов, а не посимвольно.
function nameKey(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/ё/g, "е")
      .split(/[^а-яa-z0-9]+/i)
      .filter((w) => w.length > 2),
  );
}

export function namesAgree(a: string, b: string): boolean {
  const [x, y] = [nameKey(a), nameKey(b)];
  if (!x.size || !y.size) return false;
  let common = 0;
  for (const w of x) if (y.has(w)) common++;
  // Половина слов меньшего названия должна найтись в большем.
  return common >= Math.max(1, Math.ceil(Math.min(x.size, y.size) / 2));
}

export type FreeLookup = {
  entries: BarcodeDbEntry[];
  // Штрихкод нашёлся в двух независимых справочниках. Это подтверждает, что
  // товар существует и номер не выдуман. Само НАЗВАНИЕ при этом может быть
  // записано по-разному («КОКА-КОЛА Ж.Б 0.33 Л.» и «Coca-Cola 330 ml»),
  // поэтому в интерфейсе так и пишем — «есть в двух справочниках», а не
  // «название подтверждено».
  inTwoSources: boolean;
  // Названия из разных источников совпали и по смыслу — самый сильный признак.
  namesMatch: boolean;
  origins: ("ru" | "off")[];
  // Хотя бы один справочник не ответил (429, таймаут). Пустой результат в
  // этом случае НЕ означает «товара нет» — значит «не удалось проверить»,
  // и вызывающий должен предложить повтор, а не писать «не найдено».
  degraded: boolean;
};

// Оба бесплатных источника разом. Ни один из них не стоит денег, поэтому
// спрашиваем всегда и параллельно — до платного ИИ-поиска дело доходит,
// только если оба промолчали.
// Кеш сводного ответа справочников. Кешируем только удачные разборы (в том
// числе честное «нигде нет»): результат со сбоем сохранять нельзя — иначе
// временная недоступность Open Food Facts запомнилась бы на сутки как
// «товара не существует».
const freeCache = new Map<string, { at: number; value: FreeLookup }>();

export async function lookupFreeSources(barcode: string): Promise<FreeLookup> {
  const cached = freeCache.get(barcode);
  if (cached && Date.now() - cached.at < ttlFor(cached.value.entries.length === 0)) return cached.value;

  // Порядок, а не параллель. Российский справочник быстрый (0,2с), надёжный и
  // знает большинство товаров российского магазина. Open Food Facts, наоборот,
  // жёстко ограничивает частоту и отвечает 429 — поэтому идём к нему только
  // тогда, когда первый ничего не дал. На пачке из 30 позиций это убирает
  // почти все обращения ко второму источнику и снимает лимит.
  let ru: BarcodeDbEntry[] = [];
  let ruFailed = false;
  try {
    ru = await lookupBarcodeDb(barcode);
  } catch (e) {
    ruFailed = true;
    console.warn("справочник RU недоступен:", (e as Error)?.message);
  }

  let off: BarcodeDbEntry[] = [];
  let offFailed = false;
  if (ru.length === 0) {
    try {
      off = await lookupOpenFacts(barcode);
    } catch (e) {
      offFailed = true;
      console.warn("Open Food Facts недоступен:", (e as Error)?.message);
    }
  }
  // «Не удалось проверить» — только если ни один источник не дал ответа И
  // при этом кто-то из них отказал. Если товар нашёлся, сбой второго не важен.
  const degraded = ru.length === 0 && off.length === 0 && (ruFailed || offFailed);

  const entries = [...ru, ...off];
  const inTwoSources = ru.length > 0 && off.length > 0;
  const namesMatch = inTwoSources && ru.some((r) => off.some((o) => namesAgree(r.name, o.name)));
  const origins = [...new Set(entries.map((e) => e.origin))];
  const value: FreeLookup = { entries, inTwoSources, namesMatch, origins, degraded };
  if (!degraded) {
    if (freeCache.size >= CACHE_MAX) {
      let oldestKey: string | null = null;
      let oldestAt = Infinity;
      for (const [k, v] of freeCache) if (v.at < oldestAt) { oldestAt = v.at; oldestKey = k; }
      if (oldestKey) freeCache.delete(oldestKey);
    }
    freeCache.set(barcode, { at: Date.now(), value });
  }
  return value;
}

// Какой из вариантов справочника показать человеку. Один рейтинг —
// плохой ориентир: у «ТЕТРАДЬ С ОБЛОШКАЙ МАТЕМАТИКА» он может быть выше, чем у
// подробного «ТЕТРАДЬ 12Л., BG "UNITONE", ПЛАСТИКОВАЯ ОБЛОЖКА». Поэтому к
// рейтингу добавляем информативность — сколько осмысленных слов в названии.
export function pickBestEntry(entries: BarcodeDbEntry[]): BarcodeDbEntry | null {
  if (!entries.length) return null;
  const score = (e: BarcodeDbEntry) => {
    const words = e.name.split(/[\s.,]+/u).filter((w) => w.length > 1).length;
    return e.rating * 2 + Math.min(words, 8);
  };
  return entries.reduce((best, e) => (score(e) > score(best) ? e : best), entries[0]);
}

function remember(barcode: string, entries: BarcodeDbEntry[]) {
  if (cache.size >= CACHE_MAX) {
    // Простейшая уборка: выкидываем самую старую запись.
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [k, v] of cache) if (v.at < oldestAt) { oldestAt = v.at; oldestKey = k; }
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(barcode, { at: Date.now(), entries });
}

// Бросает LookupUnavailableError, если справочник не ответил. Раньше здесь
// стоял «return []», и недоступность справочника выглядела для пользователя
// как «товара нет» — из-за этого пачки и теряли половину позиций.
export async function lookupBarcodeDb(barcode: string): Promise<BarcodeDbEntry[]> {
  const hit = cache.get(barcode);
  if (hit && Date.now() - hit.at < ttlFor(hit.entries.length === 0)) return hit.entries;

  const res = await politeFetch(
    RU_HOST,
    `${ENDPOINT}?barcode=${encodeURIComponent(barcode)}`,
    {
      headers: {
        // Без внятного User-Agent сайт отдаёт заглушку.
        "User-Agent": "Mozilla/5.0 (compatible; TorgOS/1.0; +https://torgos.ru)",
        "Accept-Language": "ru-RU,ru;q=0.9",
      },
    },
    // Справочник надёжен — отключаем его только после серии отказов и
    // ненадолго, иначе потеряем основной бесплатный источник из-за всплеска.
    { minGapMs: RU_GAP_MS, retries: 2, timeoutMs: TIMEOUT_MS, circuitAfter: 5, circuitCooldownMs: 60_000 },
  );
  if (!res.ok) {
    // 404 и прочие окончательные ответы — «нет такого», запоминаем.
    remember(barcode, []);
    return [];
  }
  const entries = parseBarcodeListHtml(await res.text(), barcode);
  remember(barcode, entries);
  return entries;
}
