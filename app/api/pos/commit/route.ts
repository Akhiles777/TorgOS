import { NextResponse } from "next/server";
import { requireApi, AuthError } from "@/server/guard";
import { commitSale, PosError, type CommitPayload } from "@/server/services/pos";
import { getCurrentShift } from "@/server/services/shift";
import { broadcastStock } from "@/server/realtime";

export async function POST(req: Request) {
  try {
    const { user, db } = await requireApi("OWNER", "ADMIN", "CASHIER");
    if (!user.storeId) throw new PosError("У пользователя не задана точка");
    const body = (await req.json()) as CommitPayload;

    // Кто на смене определяем на сервере (клиенту не доверяем атрибуцию).
    const shift = await getCurrentShift(db, user.storeId);
    const result = await commitSale(db, user.storeId, user.id, body, shift?.employee.id ?? null);
    // Рассылаем новые остатки на все открытые кассы этой точки
    broadcastStock(user.storeId, result.stockUpdates, result.number);

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof PosError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("commit error", e);
    return NextResponse.json({ error: "Не удалось пробить чек" }, { status: 500 });
  }
}
