import { NextResponse } from "next/server";
import { requireApiStoreScope, AuthError } from "@/server/guard";
import { findProductByBarcode } from "@/server/services/products";

// Используется и «Приход/поиском по сканеру» в /admin, и предпроверкой перед
// сканом в /admin/inventory (узнать unit товара до того, как спрашивать вес).
export async function GET(req: Request) {
  try {
    const { db, storeId } = await requireApiStoreScope("ADMIN", "OWNER");
    const barcode = new URL(req.url).searchParams.get("barcode")?.trim() ?? "";
    if (!barcode) return NextResponse.json({ product: null });
    const product = await findProductByBarcode(db, storeId, barcode);
    return NextResponse.json({ product });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Ошибка поиска" }, { status: 500 });
  }
}
