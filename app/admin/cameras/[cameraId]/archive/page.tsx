import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/server/guard";
import { AppShell } from "@/components/AppShell";
import { getCameraWithAccess, CameraAccessDeniedError } from "@/server/services/cameras";
import { AdminTabs } from "../../../AdminTabs";
import { ArchiveScreen } from "./ArchiveScreen";

export const dynamic = "force-dynamic";

export default async function CameraArchivePage({ params }: { params: Promise<{ cameraId: string }> }) {
  const { cameraId } = await params;
  const { user, db } = await requireRole("OWNER", "ADMIN");

  let camera;
  try {
    camera = await getCameraWithAccess(db, cameraId, user);
  } catch (e) {
    if (e instanceof CameraAccessDeniedError) redirect("/admin/cameras");
    throw e;
  }
  if (!camera) notFound();

  return (
    <AppShell
      role={user.role} userName={user.name} active="admin" email={user.email}
      emailVerifiedAt={user.emailVerifiedAt} impersonating={user.impersonating}
    >
      <AdminTabs />
      <ArchiveScreen cameraId={camera.id} cameraName={camera.name} />
    </AppShell>
  );
}
