import { requireHorecaStoreScope } from "@/server/org";
import { listCategories, listMenuItems, listModifierGroups } from "@/server/services/horeca/menu";
import { listProducts } from "@/server/services/products";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "../AdminTabs";
import { MenuManager } from "./MenuManager";

export const dynamic = "force-dynamic";

export default async function MenuPage() {
  const { user, db, storeId } = await requireHorecaStoreScope("ADMIN", "OWNER");
  const [categories, items, groups, ingredients] = await Promise.all([
    listCategories(db, storeId),
    listMenuItems(db, storeId),
    listModifierGroups(db, storeId),
    listProducts(db, storeId, "all"),
  ]);

  return (
    <AppShell role={user.role} userName={user.name} active="admin" email={user.email} emailVerifiedAt={user.emailVerifiedAt} impersonating={user.impersonating}>
      <AdminTabs />
      <MenuManager categories={categories} items={items} groups={groups} ingredients={ingredients} />
    </AppShell>
  );
}
