import { requireStoreScope } from "@/server/guard";
import { getActiveSession } from "@/server/services/inventory";
import { listProducts } from "@/server/services/products";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "../AdminTabs";
import { InventoryScreen } from "./InventoryScreen";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const { user, db, storeId } = await requireStoreScope("ADMIN", "OWNER");
  const [session, products] = await Promise.all([
    getActiveSession(db, storeId),
    listProducts(db, storeId, "all"),
  ]);

  return (
    <AppShell role={user.role} userName={user.name} active="admin" email={user.email} emailVerifiedAt={user.emailVerifiedAt} impersonating={user.impersonating}>
      <AdminTabs />
      <InventoryScreen
        initialSession={session}
        products={products.map((p) => ({ id: p.id, name: p.name, unit: p.unit, category: p.category, barcode: p.barcode }))}
      />
    </AppShell>
  );
}
