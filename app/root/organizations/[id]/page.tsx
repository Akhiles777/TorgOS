import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/server/superAdminGuard";
import { getOrganizationDetail } from "@/server/services/rootAdmin";
import { RootShell } from "@/components/root/RootShell";
import { OrganizationDetail } from "./OrganizationDetail";

export const dynamic = "force-dynamic";

export default async function OrganizationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const sa = await requireSuperAdmin();
  const { id } = await params;
  const org = await getOrganizationDetail(id);
  if (!org) notFound();

  return (
    <RootShell active="/root/organizations" adminName={sa.name}>
      <OrganizationDetail org={org} />
    </RootShell>
  );
}
