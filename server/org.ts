// Определение типа организации (RETAIL/HORECA) для экранов, которые должны
// вести себя по-разному в зависимости от бизнес-модели точки. Намеренно
// отдельный модуль, а не правка server/guard.ts — тот исполняется на КАЖДОМ
// запросе живой розничной кассы, и лишний риск там неуместен (см. отчёт по
// фиче HORECA). requireRole/requireStoreScope и их API-аналоги остаются
// байт-в-байт как были.
import { redirect } from "next/navigation";
import type { OrgType, Role } from "@prisma/client";
import type { SessionUser } from "./auth";
import type { TenantDb } from "./tenant";
import { requireRole, requireStoreScope, requireApi, requireApiStoreScope, AuthError } from "./guard";

export async function getOrgType(db: TenantDb, organizationId: string): Promise<OrgType> {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { type: true } });
  if (!org) throw new AuthError(404, "Организация не найдена");
  return org.type;
}

// Для страниц общепита: редиректит на /admin, если организация не HORECA
// (например, вручную открыли /admin/menu из розничного аккаунта).
export async function requireHorecaStoreScope(
  ...allowed: Role[]
): Promise<{ user: SessionUser; db: TenantDb; storeId: string }> {
  const { user, db, storeId } = await requireStoreScope(...allowed);
  const type = await getOrgType(db, user.organizationId);
  if (type !== "HORECA") redirect("/admin");
  return { user, db, storeId };
}

export async function requireHorecaRole(
  ...allowed: Role[]
): Promise<{ user: SessionUser; db: TenantDb }> {
  const { user, db } = await requireRole(...allowed);
  const type = await getOrgType(db, user.organizationId);
  if (type !== "HORECA") redirect("/admin");
  return { user, db };
}

// Для API/server actions общепита: бросает вместо редиректа.
export async function requireHorecaApiStoreScope(
  ...allowed: Role[]
): Promise<{ user: SessionUser; db: TenantDb; storeId: string }> {
  const { user, db, storeId } = await requireApiStoreScope(...allowed);
  const type = await getOrgType(db, user.organizationId);
  if (type !== "HORECA") throw new AuthError(403, "Доступно только для общепита");
  return { user, db, storeId };
}

export async function requireHorecaApi(
  ...allowed: Role[]
): Promise<{ user: SessionUser; db: TenantDb }> {
  const { user, db } = await requireApi(...allowed);
  const type = await getOrgType(db, user.organizationId);
  if (type !== "HORECA") throw new AuthError(403, "Доступно только для общепита");
  return { user, db };
}
