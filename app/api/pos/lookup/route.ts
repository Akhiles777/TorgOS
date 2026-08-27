import { NextResponse } from "next/server";
import { requireApiStoreScope, AuthError } from "@/server/guard";
import { findByBarcode } from "@/server/services/pos";

export async function GET(req: Request) {
  try {
    // См. комментарий в app/api/pos/commit/route.ts: у владельца с одной точкой
    // user.storeId пустой, поэтому точку берём через общий гейт.
    const { db, storeId } = await requireApiStoreScope("OWNER", "ADMIN", "CASHIER");
    const barcode = new URL(req.url).searchParams.get("barcode")?.trim() ?? "";
    if (!barcode) return NextResponse.json({ product: null });
    const product = await findByBarcode(db, storeId, barcode);
    return NextResponse.json({ product });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Ошибка поиска" }, { status: 500 });
  }
}
