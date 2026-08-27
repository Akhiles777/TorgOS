// Бесплатный справочник штрихкодов barcode-list.ru — открытая база, которую
// наполняют сами магазины. Именно в ней лежит российская непродовольственная
// мелочь (канцелярия, бытовая химия, хозтовары), которой нет ни в
// международных каталогах, ни в поисковой выдаче: живая проверка на трёх
// реальных штрихкодах владельца показала, что ни обычный веб-поиск, ни поиск
// Wildberries их не знают, а этот справочник знает все три.
//
// Поэтому порядок в barcodeLookup.ts такой: сначала бесплатный справочник,
// платная модель с веб-поиском — только если справочник промолчал.

const ENDPOINT = "https://barcode-list.ru/barcode/RU/Поиск.htm";
const TIMEOUT_MS = 12_000;
// Сутки: товарные названия в справочнике меняются крайне редко, а повторный
// скан того же штрихкода (пересорт, вторая поставка) — обычное дело.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;

export type BarcodeDbEntry = {
  name: string;
  // «ШТ.» / «КГ» из справочника — заодно избавляет от угадывания единицы.
  unit: "PCS" | "KG" | null;
  // Сколько магазинов сообщили это название: чем больше, тем достовернее.
  rating: number;
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

    entries.push({ name, unit, rating: Number.isFinite(rating) ? rating : 0 });
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

export async function lookupBarcodeDb(barcode: string): Promise<BarcodeDbEntry[]> {
  const hit = cache.get(barcode);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.entries;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ENDPOINT}?barcode=${encodeURIComponent(barcode)}`, {
      signal: controller.signal,
      headers: {
        // Без внятного User-Agent сайт отдаёт заглушку.
        "User-Agent": "Mozilla/5.0 (compatible; TorgOS/1.0; +https://torgos.ru)",
        "Accept-Language": "ru-RU,ru;q=0.9",
      },
    });
    if (!res.ok) return [];
    const entries = parseBarcodeListHtml(await res.text(), barcode);

    if (cache.size >= CACHE_MAX) {
      // Простейшая уборка: выкидываем самую старую запись.
      let oldestKey: string | null = null;
      let oldestAt = Infinity;
      for (const [k, v] of cache) if (v.at < oldestAt) { oldestAt = v.at; oldestKey = k; }
      if (oldestKey) cache.delete(oldestKey);
    }
    cache.set(barcode, { at: Date.now(), entries });
    return entries;
  } catch {
    // Справочник недоступен или медленный — не повод ронять добавление товара:
    // вызывающий просто пойдёт дальше, к платному поиску.
    return [];
  } finally {
    clearTimeout(timer);
  }
}
