import { NextResponse } from "next/server";
import { requireApi, AuthError } from "@/server/guard";
import { aiFindProducts } from "@/server/ai/product-search";

export async function POST(req: Request) {
  try {
    const { user, db } = await requireApi("OWNER", "ADMIN", "CASHIER");
    if (!user.storeId) return NextResponse.json({ ids: [] });
    const { query } = (await req.json()) as { query?: string };
    const ids = await aiFindProducts(db, user.storeId, String(query ?? ""));
    return NextResponse.json({ ids });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ ids: [] });
  }
}
