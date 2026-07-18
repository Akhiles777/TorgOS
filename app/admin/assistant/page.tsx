import { requireStoreScope } from "@/server/guard";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "../AdminTabs";
import { AssistantChat } from "./AssistantChat";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const { user } = await requireStoreScope("ADMIN", "OWNER");
  return (
    <AppShell role={user.role} userName={user.name} active="admin">
      <AdminTabs />
      <AssistantChat userName={user.name} />
    </AppShell>
  );
}
