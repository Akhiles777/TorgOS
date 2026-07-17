import { NextResponse } from "next/server";
import { requireApi, AuthError } from "@/server/guard";
import { findByBarcode } from "@/server/services/pos";

export async function GET(req: Request) {
  try {
    const { user, db } = await requireApi("CASHIER", "ADMIN");
    if (!user.storeId) return NextResponse.json({ error: "Нет точки" }, { status: 400 });
    const barcode = new URL(req.url).searchParams.get("barcode")?.trim() ?? "";
    if (!barcode) return NextResponse.json({ product: null });
    const product = await findByBarcode(db, user.storeId, barcode);
    return NextResponse.json({ product });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Ошибка поиска" }, { status: 500 });
  }
}
