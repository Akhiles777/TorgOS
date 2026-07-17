import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { getCurrentUser, type SessionUser } from "./auth";
import { tenantDb } from "./tenant";

// Куда отправлять роль по умолчанию (кассир в /owner получает редирект, а не пустоту).
export function homeFor(role: Role): string {
  switch (role) {
    case "CASHIER": return "/pos";
    case "ADMIN": return "/admin";
    case "OWNER": return "/owner";
  }
}

// Гард для страниц. Возвращает пользователя + tenant-ограниченный клиент.
// Не та роль — редирект на «свой» дом, а не 403-заглушка.
export async function requireRole(...allowed: Role[]): Promise<{ user: SessionUser; db: ReturnType<typeof tenantDb> }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (allowed.length && !allowed.includes(user.role)) redirect(homeFor(user.role));
  return { user, db: tenantDb(user.organizationId) };
}

// Для страниц админки точки: ADMIN всегда привязан к storeId. У OWNER storeId
// может быть не задан (владелец видит все точки в /owner) — если он открывает
// /admin, а точка у организации всего одна, подставляем её автоматически,
// чтобы владелец-он-же-администратор не улетал редиректом на пустое место.
export async function requireStoreScope(...allowed: Role[]): Promise<{ user: SessionUser; db: ReturnType<typeof tenantDb>; storeId: string }> {
  const { user, db } = await requireRole(...allowed);
  if (user.storeId) return { user, db, storeId: user.storeId };
  const stores = await db.store.findMany({ select: { id: true }, take: 2 });
  if (stores.length === 1) return { user, db, storeId: stores[0].id };
  // Несколько точек и ни одна не выбрана — пока нет UI выбора точки,
  // возвращаем в кабинет владельца вместо неоднозначного состояния.
  redirect("/owner");
}

// Для API-роутов: бросает, не редиректит.
export async function requireApi(...allowed: Role[]): Promise<{ user: SessionUser; db: ReturnType<typeof tenantDb> }> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError(401, "Требуется вход");
  if (allowed.length && !allowed.includes(user.role)) throw new AuthError(403, "Недостаточно прав");
  return { user, db: tenantDb(user.organizationId) };
}

// Аналог requireStoreScope для Server Actions/API — бросает вместо редиректа.
export async function requireApiStoreScope(...allowed: Role[]): Promise<{ user: SessionUser; db: ReturnType<typeof tenantDb>; storeId: string }> {
  const { user, db } = await requireApi(...allowed);
  if (user.storeId) return { user, db, storeId: user.storeId };
  const stores = await db.store.findMany({ select: { id: true }, take: 2 });
  if (stores.length === 1) return { user, db, storeId: stores[0].id };
  throw new AuthError(400, "Не удалось определить точку — выберите точку явно");
}

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
