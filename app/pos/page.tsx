import { redirect } from "next/navigation";
import { requireRole } from "@/server/guard";
import { loadPosProducts } from "@/server/services/pos";
import { PosScreen } from "@/components/pos/PosScreen";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const { user, db } = await requireRole("CASHIER", "ADMIN");
  if (!user.storeId) redirect("/admin");
  const products = await loadPosProducts(db, user.storeId);
  return <PosScreen initialProducts={products} cashierName={user.name} />;
}
