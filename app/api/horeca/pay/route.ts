import { NextResponse } from "next/server";
import { AuthError } from "@/server/guard";
import { requireHorecaApiStoreScope } from "@/server/org";
import { payOrder, OrderError } from "@/server/services/horeca/orders";
import type { DraftLine } from "@/server/services/horeca/types";
import type { PaymentMethod } from "@prisma/client";
import { getCurrentShift } from "@/server/services/shift";
import { broadcastStock } from "@/server/realtime";

type Body = {
  orderId?: string;
  lines?: DraftLine[];
  paymentMethod: PaymentMethod;
  cashGiven?: number | null;
  isDebt?: boolean;
  debtorName?: string | null;
  debtorContact?: string | null;
};

export async function POST(req: Request) {
  try {
    const { user, db, storeId } = await requireHorecaApiStoreScope("OWNER", "ADMIN", "CASHIER");
    const body = (await req.json()) as Body;
    const source = body.orderId ? { orderId: body.orderId } : { lines: body.lines ?? [] };

    // Кто на смене определяем на сервере (клиенту не доверяем атрибуцию) — тот же принцип, что в рознице.
    const shift = await getCurrentShift(db, storeId);
    const result = await payOrder(db, storeId, user.id, shift?.employee.id ?? null, source, {
      paymentMethod: body.paymentMethod, cashGiven: body.cashGiven, isDebt: body.isDebt,
      debtorName: body.debtorName, debtorContact: body.debtorContact,
    });
    broadcastStock(storeId, result.stockUpdates, result.number);

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("horeca pay error", e);
    return NextResponse.json({ error: "Не удалось пробить чек" }, { status: 500 });
  }
}
