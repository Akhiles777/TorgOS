// Быстрое добавление товаров пачкой (/admin/quick): продавец копит список из
// «штрихкод + цена», ИИ дозаполняет названия, и уже проверенная пачка
// сохраняется одним нажатием. Создание идёт через тот же createProduct, что и
// ручная форма — та же валидация штрихкода, та же защита от дублей.
import type { TenantDb } from "../tenant";
import { createProduct, moveStock, ProductError } from "./products";
import { Prisma, type Unit } from "@prisma/client";

// Проверка дубля в createProduct и запись — не атомарны, поэтому две кассы,
// заводящие один штрихкод одновременно, могут проскочить проверку и упереться
// уже в уникальный индекс БД (@@unique([storeId, barcode])). Ошибку индекса
// переводим в тот же текст, что и обычный дубль, — для человека это одно и то
// же событие, а не «неизвестный сбой».
export function describeSaveError(e: unknown): string | null {
  if (e instanceof ProductError) return e.message;
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    return "Такой штрихкод уже есть в этой точке";
  }
  return null;
}

export type QuickRow = {
  barcode: string;
  name: string;
  category: string;
  price: number;
  costPrice: number;
  unit: Unit;
  stock: number;
};

export type QuickSaveResult = {
  created: { barcode: string; name: string }[];
  failed: { barcode: string; name: string; error: string }[];
};

// Пачка сохраняется построчно, а не одной транзакцией: если одна позиция
// кривая (дубль штрихкода, пустое название), остальные всё равно должны
// сохраниться — иначе продавец теряет всю набитую пачку из-за одной строки.
// Непрошедшие строки возвращаются вызывающему, чтобы остаться в списке.
export async function saveQuickRows(
  db: TenantDb,
  storeId: string,
  userId: string,
  rows: QuickRow[],
): Promise<QuickSaveResult> {
  const result: QuickSaveResult = { created: [], failed: [] };

  for (const r of rows) {
    try {
      const created = await createProduct(db, storeId, {
        name: r.name,
        price: r.price,
        costPrice: r.costPrice,
        unit: r.unit,
        category: r.category,
        barcode: r.barcode || null,
        stock: 0,
      });
      // Начальный остаток проводим движением, а не полем stock — чтобы приход
      // был виден в истории склада, как у любой другой поставки.
      if (r.stock > 0) {
        await moveStock(db, created.id, userId, "IN", r.stock, "быстрое добавление");
      }
      result.created.push({ barcode: r.barcode, name: created.name });
    } catch (e) {
      const known = describeSaveError(e);
      if (!known) console.error("quick add failed", r.barcode, e);
      result.failed.push({ barcode: r.barcode, name: r.name, error: known ?? "Не удалось сохранить" });
    }
  }

  return result;
}
