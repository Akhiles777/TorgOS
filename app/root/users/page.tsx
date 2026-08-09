import { requireSuperAdmin } from "@/server/superAdminGuard";
import { RootShell } from "@/components/root/RootShell";
import { UserSearch } from "./UserSearch";

export const dynamic = "force-dynamic";

export default async function RootUsersPage() {
  const sa = await requireSuperAdmin();
  return (
    <RootShell active="/root/users" adminName={sa.name}>
      <h1 className="text-lg font-semibold mb-1">Пользователи</h1>
      <p className="text-xs text-ink-soft mb-4">Поиск по имени, логину или email — по всем организациям сразу.</p>
      <UserSearch />
    </RootShell>
  );
}
