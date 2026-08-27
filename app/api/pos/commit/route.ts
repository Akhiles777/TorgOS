import { NextResponse } from "next/server";
import { requireApiStoreScope, AuthError } from "@/server/guard";
import { commitSale, PosError, type CommitPayload } from "@/server/services/pos";
import { getCurrentShift } from "@/server/services/shift";
import { broadcastStock } from "@/server/realtime";

export async function POST(req: Request) {
  try {
    // requireApiStoreScope, а не requireApi + user.storeId: у владельца с одной
    // точкой storeId в сессии пустой (он не привязан к точке жёстко, как ADMIN),
    // и прямое чтение user.storeId роняло оплату на «У пользователя не задана
    // точка» — касса открывалась, но пробить чек было нельзя. Гейт точки теперь
    // тот же, что на всех остальных экранах точки.
    const { user, db, storeId } = await requireApiStoreScope("OWNER", "ADMIN", "CASHIER");
    const body = (await req.json()) as CommitPayload;

    // Кто на смене определяем на сервере (клиенту не доверяем атрибуцию).
    const shift = await getCurrentShift(db, storeId);
    const result = await commitSale(db, storeId, user.id, body, shift?.employee.id ?? null);
    // Рассылаем новые остатки на все открытые кассы этой точки
    broadcastStock(storeId, result.stockUpdates, result.number);

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof PosError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("commit error", e);
    return NextResponse.json({ error: "Не удалось пробить чек" }, { status: 500 });
  }
}
