import { requireHorecaStoreScope } from "@/server/org";
import { listSemiFinished, listProductionDocs } from "@/server/services/horeca/production";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "../AdminTabs";
import { ProductionScreen } from "./ProductionScreen";

export const dynamic = "force-dynamic";

export default async function ProductionPage() {
  const { user, db, storeId } = await requireHorecaStoreScope("ADMIN", "OWNER");
  const [semiFinished, docs] = await Promise.all([
    listSemiFinished(db, storeId),
    listProductionDocs(db, storeId),
  ]);

  return (
    <AppShell role={user.role} userName={user.name} active="admin" email={user.email} emailVerifiedAt={user.emailVerifiedAt} impersonating={user.impersonating}>
      <AdminTabs />
      <ProductionScreen semiFinished={semiFinished} docs={docs} />
    </AppShell>
  );
}
