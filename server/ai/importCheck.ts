// ИИ-проверка качества номенклатуры перед импортом. Строгий контракт из
// брифа: модель НИЧЕГО не меняет сама, только возвращает список замечаний
// (Finding[]) для ручного «Применить»/«Пропустить». Никогда не бросает —
// сбой (нет ключа, таймаут, битый JSON) превращается в failed:true, и
// вызывающий код показывает «проверка не удалась», а импорт продолжается
// без неё. Тот же защитный разбор JSON-массива, что и в product-intake.ts.
import { chatComplete, AiUnavailableError } from "./routerai";
import type { ParsedProductRow } from "@/lib/importParser";

// Ровно те 7 полей, которые осмысленно проверять на КАЧЕСТВО данных — без
// "stock": у ИИ нет оснований судить об остатке, это не вопрос грязных данных.
export type FindingField = "name" | "price" | "costPrice" | "category" | "unit" | "expiry" | "barcode";

export type Finding = {
  row: number;
  field: FindingField;
  severity: "error" | "warning";
  current: string;
  suggested: string | null;
  reason: string;
};

export type CheckBatchResult = { findings: Finding[]; failed: boolean };

const FIELD_SET = new Set<FindingField>(["name", "price", "costPrice", "category", "unit", "expiry", "barcode"]);
const SEVERITY_SET = new Set(["error", "warning"]);

function buildPrompt(rows: { index: number; row: ParsedProductRow }[], existingCategories: string[]): { system: string; user: string } {
  const system =
    "Ты проверяешь качество данных номенклатуры товаров перед импортом в магазин. Ищи: мусорные названия " +
    '("Товар1", "ЗАКРЫТО", "!!!не продавать", одни цифры, пусто), подозрительные цены (явно не в том разряде — ' +
    "слишком низкая или слишком высокая для типа товара), закупочную цену выше розничной, категорию, не " +
    "соответствующую названию, вероятные смысловые дубли между позициями (разное написание одного и того же " +
    "товара), единицу измерения, не подходящую товару, срок годности в прошлом или неправдоподобно далеко " +
    "в будущем (50+ лет).\n\n" +
    "СТРОГИЕ ПРАВИЛА: ничего не выдумывай. Не придумывай штрихкоды. Не предлагай категорию, которой нет в " +
    "списке категорий этой организации — если подходящей нет, suggested делай null. Не меняй названия ради " +
    "«красоты» — только если название явно мусорное. Если не уверен — suggested: null, но всё равно заведи " +
    "запись с честной reason, чтобы человек посмотрел сам.\n\n" +
    "Ответь СТРОГО валидным JSON-массивом, без markdown-обёртки, без пояснений до или после. Каждый элемент вида:\n" +
    '{"row":число_строки_как_дано,"field":"name|price|costPrice|category|unit|expiry|barcode","severity":"error|warning","current":"текущее значение","suggested":"предложение или null","reason":"одна короткая фраза по-русски"}\n' +
    "Если замечаний нет — верни пустой массив [].";

  const catalogue = existingCategories.length ? existingCategories.join(", ") : "(категорий пока нет)";
  const lines = rows
    .map(({ index, row }) => {
      const parts = [
        `цена ${row.price}`,
        `закуп ${row.costPrice}`,
        row.unit === "KG" ? "кг" : "шт",
        `категория "${row.category}"`,
        `штрихкод ${row.barcode ?? "нет"}`,
      ];
      if (row.expiry) parts.push(`срок годности ${row.expiry}`);
      return `${index}. ${row.name} | ${parts.join(" | ")}`;
    })
    .join("\n");

  const user = `Существующие категории организации: ${catalogue}\n\nПозиции на проверку (номер. данные):\n${lines}`;
  return { system, user };
}

function parseFindings(raw: string, existingCategories: string[], validIndices: Set<number>): Finding[] {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const categorySet = new Set(existingCategories);
  const out: Finding[] = [];
  for (const r of parsed as Record<string, unknown>[]) {
    if (!r || typeof r !== "object") continue;
    const row = Number(r.row);
    if (!Number.isInteger(row) || !validIndices.has(row)) continue;
    const field = String(r.field ?? "") as FindingField;
    if (!FIELD_SET.has(field)) continue;
    const severity = SEVERITY_SET.has(String(r.severity)) ? (r.severity as "error" | "warning") : "warning";
    const current = String(r.current ?? "").slice(0, 200);
    let suggested = r.suggested == null ? null : String(r.suggested).slice(0, 200);
    // Промпту не доверяем вслепую: предложенная категория обязана быть из уже существующих.
    if (field === "category" && suggested !== null && !categorySet.has(suggested)) suggested = null;
    const reason = String(r.reason ?? "").slice(0, 200);
    if (!reason) continue;
    out.push({ row, field, severity, current, suggested, reason });
  }
  return out.slice(0, 200);
}

export async function checkImportBatch(
  rows: { index: number; row: ParsedProductRow }[],
  existingCategories: string[],
): Promise<CheckBatchResult> {
  if (rows.length === 0) return { findings: [], failed: false };

  const { system, user } = buildPrompt(rows, existingCategories);
  let raw: string;
  try {
    raw = await chatComplete([
      { role: "system", content: system },
      { role: "user", content: user },
    ], { maxTokens: 2000 });
  } catch (e) {
    if (!(e instanceof AiUnavailableError)) console.error("Import AI check error:", e);
    return { findings: [], failed: true };
  }

  const validIndices = new Set(rows.map((r) => r.index));
  return { findings: parseFindings(raw, existingCategories, validIndices), failed: false };
}
