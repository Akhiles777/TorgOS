// Одинаковые категории, написанные по-разному: «крупа» и «Крупы».
//
// Категория товара — обычная строка, а не справочник: её набирают руками при
// заведении товара и на кассе. Поэтому одно и то же появляется в нескольких
// написаниях, и в кассе вместо одной плитки «Крупы» их две, с половиной
// товара в каждой. Найти это правилами нельзя: «крупа/крупы» — одно, а
// «сок/соки» и «сок/носки» — разные пары, и решает тут язык, а не сравнение
// строк. Поэтому группы предлагает модель, а проверяет и применяет — код.
//
// Что делает скрипт:
//   1. Берёт категории ПЛИТОК кассы — те, что стоят у товаров с showInPos.
//      Именно их видит кассир, и именно они двоятся.
//   2. Просит модель сгруппировать написания одного и того же.
//   3. Проверяет ответ построчно: имя обязано быть из списка, главное имя —
//      из своей же группы. Выдуманных категорий не принимаем.
//   4. Показывает план. Пишет только с --apply.
//
// Переименование затрагивает ВСЕ товары этой категории, а не только плиточные:
// иначе «Крупы» останутся у товаров со штрихкодом, и мы своими руками создадим
// то самое расхождение, которое чиним. Сколько таких товаров — печатается.
//
// Запуск:
//   npx tsx scripts/categories-dedupe.ts             — показать план
//   npx tsx scripts/categories-dedupe.ts --apply     — применить
//   npx tsx scripts/categories-dedupe.ts --store=<id>
import { PrismaClient } from "@prisma/client";
import { chatComplete, AiUnavailableError } from "../server/ai/routerai";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const STORE = process.argv.find((a) => a.startsWith("--store="))?.slice(8);

type Group = { canonical: string; members: string[] };

/**
 * Ответ модели → проверенные группы.
 *
 * Всё, чего нет во входном списке, отбрасываем: модель не должна ни
 * придумывать категории, ни переименовывать их «покрасивее». Задача у неё
 * ровно одна — сказать, какие из ЭТИХ написаний означают одно и то же.
 */
export function parseGroups(raw: string, known: string[]): Group[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const byLower = new Map(known.map((k) => [k.toLowerCase(), k]));
  const seen = new Set<string>();
  const out: Group[] = [];

  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const g = item as { canonical?: unknown; members?: unknown };
    if (typeof g.canonical !== "string" || !Array.isArray(g.members)) continue;

    // Оставляем только известные написания, каждое — не больше чем в одной группе.
    const members = [
      ...new Set(
        g.members
          .filter((m): m is string => typeof m === "string")
          .map((m) => byLower.get(m.trim().toLowerCase()))
          .filter((m): m is string => Boolean(m) && !seen.has(m!)),
      ),
    ];
    if (members.length < 2) continue;

    // Главное имя обязано быть одним из членов группы: придумывать новое
    // название категории — не наше дело.
    const canonical = byLower.get(g.canonical.trim().toLowerCase());
    if (!canonical || !members.includes(canonical)) continue;

    for (const m of members) seen.add(m);
    out.push({ canonical, members });
  }
  return out;
}

const PROMPT = [
  "Ты приводишь в порядок названия категорий товаров небольшого магазина.",
  "Тебе дан список категорий как есть. Найди среди них те, что означают ОДНО И ТО ЖЕ,",
  "но записаны по-разному: другой регистр, число, опечатка, лишний пробел.",
  "",
  "Правила:",
  "1. Группируй только заведомо одинаковое: «крупа» и «Крупы» — одно; «сок» и «соки» — одно.",
  "2. Разное не объединяй: «сок» и «вода», «молоко» и «молочка» (второе шире) — разные.",
  "3. Главным делай самое понятное написание ИЗ ЭТОЙ ЖЕ ГРУППЫ. Новых имён не придумывай.",
  "4. Категории без пары в ответ не включай.",
  "",
  'Ответ — только JSON-массив: [{"canonical":"Крупы","members":["крупа","Крупы"]}]',
  "Ничего, кроме JSON.",
].join("\n");

async function main() {
  const stores = await prisma.store.findMany({
    where: STORE ? { id: STORE } : {},
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (stores.length === 0) {
    console.error("Точек не найдено.");
    process.exit(1);
  }
  console.log(APPLY ? "режим: запись\n" : "режим: только показать (--apply чтобы применить)\n");

  for (const store of stores) {
    console.log(`── ${store.name} ──`);

    // Категории плиток: их видит кассир, они и двоятся.
    const tiles = await prisma.product.groupBy({
      by: ["category"],
      where: { storeId: store.id, showInPos: true, isActive: true },
      _count: { _all: true },
    });
    const names = tiles.map((t) => t.category).filter((c) => c.trim().length > 0);
    if (names.length < 2) {
      console.log("  категорий-плиток меньше двух — сравнивать нечего\n");
      continue;
    }
    const countByName = new Map(tiles.map((t) => [t.category, t._count._all]));
    console.log(`  категорий-плиток: ${names.length}`);

    let answer: string;
    try {
      answer = await chatComplete(
        [
          { role: "system", content: PROMPT },
          { role: "user", content: names.map((n) => `- ${n}`).join("\n") },
        ],
        { maxTokens: 1200 },
      );
    } catch (e) {
      if (e instanceof AiUnavailableError) {
        console.log(`  модель недоступна: ${e.message}\n`);
        continue;
      }
      throw e;
    }

    const groups = parseGroups(answer, names);
    if (groups.length === 0) {
      console.log("  дубликатов не нашлось\n");
      continue;
    }

    for (const g of groups) {
      const extra = g.members.filter((m) => m !== g.canonical);
      const moving = extra.reduce((sum, m) => sum + (countByName.get(m) ?? 0), 0);

      /**
       * Товары той же категории, но без плитки. Переименовываем и их —
       * иначе «Крупы» останутся у товаров со штрихкодом, и расхождение
       * никуда не денется, просто спрячется с глаз кассира.
       */
      const alsoHidden = await prisma.product.count({
        where: { storeId: store.id, category: { in: extra }, showInPos: false },
      });

      console.log(
        `  ${extra.map((m) => `«${m}»`).join(", ")} → «${g.canonical}»` +
          `  (плиток ${moving}${alsoHidden > 0 ? `, ещё ${alsoHidden} без плитки` : ""})`,
      );

      if (APPLY) {
        const res = await prisma.product.updateMany({
          where: { storeId: store.id, category: { in: extra } },
          data: { category: g.canonical },
        });
        console.log(`      переименовано товаров: ${res.count}`);
      }
    }
    console.log("");
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
