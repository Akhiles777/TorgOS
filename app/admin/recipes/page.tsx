import { requireHorecaStoreScope } from "@/server/org";
import { listRecipeOwners, getRecipeLines } from "@/server/services/horeca/costing";
import { listProducts } from "@/server/services/products";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "../AdminTabs";
import { RecipesScreen } from "./RecipesScreen";

export const dynamic = "force-dynamic";

export default async function RecipesPage({ searchParams }: { searchParams: Promise<{ item?: string; semi?: string }> }) {
  const { user, db, storeId } = await requireHorecaStoreScope("ADMIN", "OWNER");
  const sp = await searchParams;
  const [owners, ingredients] = await Promise.all([
    listRecipeOwners(db, storeId),
    listProducts(db, storeId, "all"),
  ]);

  const activeOwner = sp.item ? { menuItemId: sp.item } : sp.semi ? { ownerProductId: sp.semi } : null;
  const lines = activeOwner ? await getRecipeLines(db, activeOwner) : [];

  return (
    <AppShell role={user.role} userName={user.name} active="admin" email={user.email} emailVerifiedAt={user.emailVerifiedAt} impersonating={user.impersonating}>
      <AdminTabs />
      <RecipesScreen
        dishes={owners.dishes}
        semiProducts={owners.semiProducts}
        ingredients={ingredients}
        activeKey={sp.item ? `item:${sp.item}` : sp.semi ? `semi:${sp.semi}` : null}
        lines={lines}
      />
    </AppShell>
  );
}
