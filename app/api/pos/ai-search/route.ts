import { NextResponse } from "next/server";
import { requireApiStoreScope, AuthError } from "@/server/guard";
import { aiFindProducts } from "@/server/ai/product-search";

export async function POST(req: Request) {
  try {
    // См. комментарий в app/api/pos/commit/route.ts: у владельца с одной точкой
    // user.storeId пустой, поэтому точку берём через общий гейт.
    const { db, storeId } = await requireApiStoreScope("OWNER", "ADMIN", "CASHIER");
    const { query } = (await req.json()) as { query?: string };
    const ids = await aiFindProducts(db, storeId, String(query ?? ""));
    return NextResponse.json({ ids });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ ids: [] });
  }
}
