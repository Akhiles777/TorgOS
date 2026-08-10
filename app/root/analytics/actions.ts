"use server";
import { revalidatePath } from "next/cache";
import { requireSuperAdminApi } from "@/server/superAdminGuard";
import { getPlatformAiBriefing } from "@/server/insights/platformAi";
import { visitorStats, platformInsightData } from "@/server/services/siteAnalytics";
import { generatePlatformInsights } from "@/server/insights/platform";

export async function refreshPlatformBriefingAction() {
  await requireSuperAdminApi();
  const [stats, insightInput] = await Promise.all([visitorStats(), platformInsightData(30)]);
  const insights = generatePlatformInsights(insightInput);
  await getPlatformAiBriefing({ windowDays: 30, visitors: stats.last30d, insights }, { force: true });
  revalidatePath("/root/analytics");
}
