import { requireStoreScope } from "@/server/guard";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "../AdminTabs";
import { ImportWizard } from "./ImportWizard";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const { db, user, storeId } = await requireStoreScope("ADMIN", "OWNER");

  const [org, categories] = await Promise.all([
    db.organization.findUnique({ where: { id: user.organizationId }, select: { plan: true } }),
    db.product.findMany({ where: { storeId }, select: { category: true }, distinct: ["category"] }),
  ]);

  return (
    <AppShell role={user.role} userName={user.name} active="admin" email={user.email} emailVerifiedAt={user.emailVerifiedAt} impersonating={user.impersonating}>
      <AdminTabs />
      <ImportWizard orgPlan={org?.plan ?? "TRIAL"} existingCategories={categories.map((c) => c.category)} />
    </AppShell>
  );
}
