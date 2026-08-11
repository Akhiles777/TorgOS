import { requireRole } from "@/server/guard";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "../AdminTabs";
import { CamerasLiveScreen } from "./CamerasLiveScreen";

export const dynamic = "force-dynamic";

type AgentStatus = "PENDING" | "ONLINE" | "OFFLINE";

// Осознанное отличие от соседних /admin/*: там requireStoreScope жёстко
// резолвит одну точку, а OWNER с несколькими точками должен видеть камеры
// ВСЕХ своих магазинов (см. отчёт по фиче) — поэтому здесь requireRole
// (не гейтит по точке) + собственное ветвление по user.storeId.
export default async function CamerasPage() {
  const { user, db } = await requireRole("OWNER", "ADMIN");

  const stores = user.storeId
    ? await db.store.findMany({ where: { id: user.storeId }, select: { id: true, name: true } })
    : await db.store.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });

  const camerasByStore: Record<string, { id: string; name: string; agentId: string | null; agentStatus: AgentStatus | null }[]> = {};
  for (const store of stores) {
    const devices = await db.cameraDevice.findMany({
      where: { storeId: store.id },
      include: { agent: { select: { status: true } }, cameras: { where: { enabled: true }, orderBy: { sortOrder: "asc" } } },
    });
    camerasByStore[store.id] = devices.flatMap((d) =>
      d.cameras.map((c) => ({ id: c.id, name: c.name, agentId: d.agentId, agentStatus: d.agent?.status ?? null })),
    );
  }

  return (
    <AppShell
      role={user.role} userName={user.name} active="admin" email={user.email}
      emailVerifiedAt={user.emailVerifiedAt} impersonating={user.impersonating}
    >
      <AdminTabs />
      <CamerasLiveScreen stores={stores} camerasByStore={camerasByStore} />
    </AppShell>
  );
}
