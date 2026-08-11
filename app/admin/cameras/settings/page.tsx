import { requireRole } from "@/server/guard";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AppShell } from "@/components/AppShell";
import { listAgents, listDevices } from "@/server/services/cameras";
import { AdminTabs } from "../../AdminTabs";
import { CamerasSettingsScreen } from "./CamerasSettingsScreen";

export const dynamic = "force-dynamic";

export default async function CamerasSettingsPage() {
  const { user, db } = await requireRole("OWNER", "ADMIN");

  // Настройки — на одну точку за раз. У ADMIN она всегда одна; у OWNER с
  // несколькими точками (пока) редиректим на живой просмотр, где точку
  // выбирают явно — отдельный переключатель точки здесь не строю (см. отчёт).
  let storeId = user.storeId;
  if (!storeId) {
    const stores = await db.store.findMany({ select: { id: true }, take: 2 });
    if (stores.length !== 1) redirect("/admin/cameras");
    storeId = stores[0].id;
  }

  const [agents, devices] = await Promise.all([listAgents(db, storeId), listDevices(db, storeId)]);

  // Хост берём из заголовка запроса, не из отдельной env-переменной — тот же
  // принцип, что уже используется для редиректов в server.mjs (комментарий
  // там же: не строить абсолютные URL от req.url/захардкоженного домена).
  const host = (await headers()).get("host") ?? "localhost:3000";
  const isProd = process.env.NODE_ENV === "production";
  const serverWsUrl = `${isProd ? "wss" : "ws"}://${host}/agent-tunnel`;
  const agentDistOrigin = `${isProd ? "https" : "http"}://${host}`;

  return (
    <AppShell
      role={user.role} userName={user.name} active="admin" email={user.email}
      emailVerifiedAt={user.emailVerifiedAt} impersonating={user.impersonating}
    >
      <AdminTabs />
      <h1 className="text-lg font-semibold mb-4">Настройки камер</h1>
      <CamerasSettingsScreen storeId={storeId} initialAgents={agents} initialDevices={devices} serverWsUrl={serverWsUrl} agentDistOrigin={agentDistOrigin} />
    </AppShell>
  );
}
