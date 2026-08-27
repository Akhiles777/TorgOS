import { requireStoreScope } from "@/server/guard";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "../AdminTabs";
import { QuickAddScreen } from "./QuickAddScreen";

export const dynamic = "force-dynamic";

export default async function QuickAddPage() {
  const { user, storeId } = await requireStoreScope("ADMIN", "OWNER");
  return (
    <AppShell role={user.role} userName={user.name} active="admin" email={user.email} emailVerifiedAt={user.emailVerifiedAt} impersonating={user.impersonating}>
      <AdminTabs />
      {/* storeId — ключ черновика в localStorage: у разных точек свои списки. */}
      <QuickAddScreen storeId={storeId} />
    </AppShell>
  );
}
