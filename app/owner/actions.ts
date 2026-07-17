"use server";
import { revalidatePath } from "next/cache";
import { requireApi } from "@/server/guard";
import { ownerDashboard } from "@/server/services/analytics";
import { getAiBriefing } from "@/server/insights/ai";

export async function refreshAiBriefingAction() {
  const { user, db } = await requireApi("OWNER");
  const dashboard = await ownerDashboard(db, 14);
  await getAiBriefing(db, user.organizationId, dashboard, { force: true });
  revalidatePath("/owner");
}
