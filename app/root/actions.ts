"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSuperAdminApi, SuperAdminAuthError } from "@/server/superAdminGuard";
import { setSessionCookie } from "@/server/auth";
import {
  updateOrgPlan, extendTrial, setOrgStatus, deleteOrganization, resetUserPassword, startImpersonation,
  searchUsers, RootAdminError,
} from "@/server/services/rootAdmin";
import type { Plan, SubscriptionStatus } from "@prisma/client";

type Result = { ok: true } | { ok: false; error: string };

export async function searchUsersAction(query: string) {
  await requireSuperAdminApi();
  return searchUsers(query);
}

export async function updatePlanAction(orgId: string, plan: Plan): Promise<Result> {
  try {
    const sa = await requireSuperAdminApi();
    await updateOrgPlan(sa.id, orgId, plan);
    revalidatePath(`/root/organizations/${orgId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof SuperAdminAuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось изменить тариф" };
  }
}

export async function extendTrialAction(orgId: string, days: number): Promise<Result> {
  try {
    const sa = await requireSuperAdminApi();
    await extendTrial(sa.id, orgId, days);
    revalidatePath(`/root/organizations/${orgId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof RootAdminError || e instanceof SuperAdminAuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось продлить триал" };
  }
}

export async function setStatusAction(orgId: string, status: SubscriptionStatus): Promise<Result> {
  try {
    const sa = await requireSuperAdminApi();
    await setOrgStatus(sa.id, orgId, status);
    revalidatePath(`/root/organizations/${orgId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof SuperAdminAuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось изменить статус" };
  }
}

export async function deleteOrgAction(orgId: string, confirmName: string): Promise<Result> {
  try {
    const sa = await requireSuperAdminApi();
    await deleteOrganization(sa.id, orgId, confirmName);
  } catch (e) {
    if (e instanceof RootAdminError || e instanceof SuperAdminAuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось удалить организацию" };
  }
  redirect("/root/organizations");
}

export async function resetPasswordAction(userId: string): Promise<Result & { password?: string }> {
  try {
    const sa = await requireSuperAdminApi();
    const password = await resetUserPassword(sa.id, userId);
    return { ok: true, password };
  } catch (e) {
    if (e instanceof RootAdminError || e instanceof SuperAdminAuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось сбросить пароль" };
  }
}

// «Войти как» — ставит ОБЫЧНУЮ сессию (torgos_session) поверх root-сессии
// (torgos_root_session), обе куки живут параллельно. Редиректим на общий "/",
// который сам решит домашний экран по роли.
export async function impersonateAction(userId: string): Promise<Result> {
  let token: string;
  try {
    const sa = await requireSuperAdminApi();
    token = await startImpersonation(sa.id, userId);
  } catch (e) {
    if (e instanceof RootAdminError || e instanceof SuperAdminAuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось войти как пользователь" };
  }
  await setSessionCookie(token);
  redirect("/");
}
