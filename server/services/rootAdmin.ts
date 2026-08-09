// Супер-админка — единственное место в проекте, где сервисный код намеренно
// работает с сырым prisma, а не tenantDb: по определению нужен доступ ко всем
// организациям сразу (см. комментарий над SuperAdmin в prisma/schema.prisma
// и superAdminOnly-заглушку в server/tenant.ts).
import { randomBytes, createHash } from "node:crypto";
import { hash } from "bcryptjs";
import type { Plan, SubscriptionStatus, Prisma } from "@prisma/client";
import { prisma } from "../db";

export class RootAdminError extends Error {}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// ── Аудит ────────────────────────────────────────────────────────────────
export async function logAudit(
  superAdminId: string,
  action: string,
  targetType: string,
  targetId: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  await prisma.superAdminAuditLog.create({ data: { superAdminId, action, targetType, targetId, meta: meta as Prisma.InputJsonValue } });
}

export async function listAuditLog(take = 100) {
  const rows = await prisma.superAdminAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: { superAdmin: { select: { name: true, email: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    meta: r.meta as Record<string, unknown> | null,
    createdAt: r.createdAt.toISOString(),
    superAdminName: r.superAdmin.name,
    superAdminEmail: r.superAdmin.email,
  }));
}

// ── Дашборд ──────────────────────────────────────────────────────────────
export async function dashboardStats() {
  const [totalOrgs, totalUsers, totalStores, byStatus, recent] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.store.count(),
    prisma.organization.groupBy({ by: ["subscriptionStatus"], _count: true }),
    prisma.organization.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { id: true, name: true, type: true, createdAt: true } }),
  ]);
  const statusCounts: Record<SubscriptionStatus, number> = { TRIAL: 0, ACTIVE: 0, PAST_DUE: 0, CANCELLED: 0, SUSPENDED: 0 };
  for (const row of byStatus) statusCounts[row.subscriptionStatus] = row._count;
  return {
    totalOrgs,
    totalUsers,
    totalStores,
    statusCounts,
    recent: recent.map((o) => ({ id: o.id, name: o.name, type: o.type, createdAt: o.createdAt.toISOString() })),
  };
}

// ── Организации ──────────────────────────────────────────────────────────
export async function listOrganizations(query?: string, status?: SubscriptionStatus) {
  const rows = await prisma.organization.findMany({
    where: {
      ...(status ? { subscriptionStatus: status } : {}),
      ...(query?.trim() ? { name: { contains: query.trim(), mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { stores: true, users: true } } },
  });
  return rows.map((o) => ({
    id: o.id,
    name: o.name,
    type: o.type,
    plan: o.plan,
    subscriptionStatus: o.subscriptionStatus,
    trialEndsAt: o.trialEndsAt ? o.trialEndsAt.toISOString() : null,
    storeCount: o._count.stores,
    userCount: o._count.users,
    createdAt: o.createdAt.toISOString(),
  }));
}

export async function getOrganizationDetail(id: string) {
  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      stores: { select: { id: true, name: true, city: true, address: true, timezone: true, _count: { select: { products: true } } } },
      users: { select: { id: true, name: true, login: true, email: true, role: true, emailVerifiedAt: true, storeId: true, createdAt: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!org) return null;
  return {
    id: org.id,
    name: org.name,
    type: org.type,
    plan: org.plan,
    subscriptionStatus: org.subscriptionStatus,
    trialEndsAt: org.trialEndsAt ? org.trialEndsAt.toISOString() : null,
    pastDueSince: org.pastDueSince ? org.pastDueSince.toISOString() : null,
    nextPaymentAt: org.nextPaymentAt ? org.nextPaymentAt.toISOString() : null,
    createdAt: org.createdAt.toISOString(),
    stores: org.stores.map((s) => ({ id: s.id, name: s.name, city: s.city, address: s.address, timezone: s.timezone, productCount: s._count.products })),
    users: org.users.map((u) => ({
      id: u.id, name: u.name, login: u.login, email: u.email, role: u.role,
      emailVerified: !!u.emailVerifiedAt, storeId: u.storeId, createdAt: u.createdAt.toISOString(),
    })),
  };
}

export async function updateOrgPlan(superAdminId: string, orgId: string, plan: Plan): Promise<void> {
  await prisma.organization.update({ where: { id: orgId }, data: { plan } });
  await logAudit(superAdminId, "plan_change", "Organization", orgId, { plan });
}

export async function extendTrial(superAdminId: string, orgId: string, days: number): Promise<void> {
  if (days <= 0 || days > 365) throw new RootAdminError("Некорректное число дней");
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { trialEndsAt: true } });
  if (!org) throw new RootAdminError("Организация не найдена");
  const base = org.trialEndsAt && org.trialEndsAt.getTime() > Date.now() ? org.trialEndsAt.getTime() : Date.now();
  const trialEndsAt = new Date(base + days * 86_400_000);
  await prisma.organization.update({
    where: { id: orgId },
    data: { trialEndsAt, subscriptionStatus: "TRIAL", pastDueSince: null, trialReminderSentAt: null },
  });
  await logAudit(superAdminId, "trial_extend", "Organization", orgId, { days, newTrialEndsAt: trialEndsAt.toISOString() });
}

export async function setOrgStatus(superAdminId: string, orgId: string, status: SubscriptionStatus): Promise<void> {
  await prisma.organization.update({
    where: { id: orgId },
    data: { subscriptionStatus: status, ...(status === "PAST_DUE" ? { pastDueSince: new Date() } : { pastDueSince: null }) },
  });
  await logAudit(superAdminId, "status_change", "Organization", orgId, { status });
}

export async function deleteOrganization(superAdminId: string, orgId: string, confirmName: string): Promise<void> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
  if (!org) throw new RootAdminError("Организация не найдена");
  if (org.name !== confirmName) throw new RootAdminError("Название не совпадает — удаление отменено");
  await logAudit(superAdminId, "org_delete", "Organization", orgId, { name: org.name });
  await prisma.organization.delete({ where: { id: orgId } }); // каскад: Store/User/Product/... по схеме
}

// ── Пользователи (кросс-организационный поиск) ─────────────────────────
export async function searchUsers(query: string) {
  const q = query.trim();
  if (q.length < 2) return [];
  const rows = await prisma.user.findMany({
    where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { login: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] },
    take: 30,
    orderBy: { createdAt: "desc" },
    include: { organization: { select: { name: true } } },
  });
  return rows.map((u) => ({
    id: u.id, name: u.name, login: u.login, email: u.email, role: u.role,
    organizationId: u.organizationId, organizationName: u.organization.name,
  }));
}

function randomPassword(): string {
  return randomBytes(9).toString("base64url"); // ~12 читаемых символов
}

export async function resetUserPassword(superAdminId: string, userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, organizationId: true } });
  if (!user) throw new RootAdminError("Пользователь не найден");
  const plain = randomPassword();
  const passwordHash = await hash(plain, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  // Сбрасываем все текущие сессии пользователя — новый пароль означает конец старого доступа
  await prisma.session.deleteMany({ where: { userId } });
  await logAudit(superAdminId, "password_reset", "User", userId, { userName: user.name });
  return plain;
}

// ── Impersonation («войти как») ─────────────────────────────────────────
const IMPERSONATE_TTL_MS = 1000 * 60 * 60 * 2; // 2 часа — короче обычной сессии

export async function startImpersonation(superAdminId: string, targetUserId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, name: true, organizationId: true } });
  if (!user) throw new RootAdminError("Пользователь не найден");
  const token = randomBytes(24).toString("base64url");
  await prisma.session.create({
    data: {
      id: sha256(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + IMPERSONATE_TTL_MS),
      impersonatedBySuperAdminId: superAdminId,
    },
  });
  await logAudit(superAdminId, "impersonate_start", "User", user.id, { userName: user.name, organizationId: user.organizationId });
  return token;
}

// Завершение подмены по опаque-токену обычной сессии (torgos_session) — не
// через SuperAdmin-гард, потому что вызывается уже из-под «войти как» сессии,
// не из-под root-сессии. Возвращает null, если это вообще не impersonation.
export async function endImpersonation(sessionToken: string): Promise<{ superAdminId: string; userName: string } | null> {
  const id = sha256(sessionToken);
  const session = await prisma.session.findUnique({ where: { id }, include: { user: { select: { name: true } } } });
  if (!session?.impersonatedBySuperAdminId) return null;
  await logAudit(session.impersonatedBySuperAdminId, "impersonate_end", "User", session.userId, { userName: session.user.name });
  await prisma.session.delete({ where: { id } });
  return { superAdminId: session.impersonatedBySuperAdminId, userName: session.user.name };
}
