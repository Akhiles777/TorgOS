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

// Биллинг-каркас (без реального списания денег). ACTIVE недостижим до
// подключения оплаты — практически это либо TRIAL (заблокирован, только если
// trialEndsAt задан и уже прошёл), либо PAST_DUE/CANCELLED/SUSPENDED, куда
// организацию переводит периодическая проверка в server.mjs.
// Важно: trialEndsAt = null (все организации, заведённые до этой миграции,
// включая продакшен) — НЕ блокируется. Блокировка возможна только для тех,
// у кого дедлайн триала явно проставлен и прошёл.
async function isBillingBlocked(db: ReturnType<typeof tenantDb>, organizationId: string): Promise<boolean> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { subscriptionStatus: true, trialEndsAt: true },
  });
  if (!org) return false;
  if (org.subscriptionStatus === "ACTIVE") return false;
  if (org.subscriptionStatus === "TRIAL") return !!org.trialEndsAt && org.trialEndsAt.getTime() < Date.now();
  return true; // PAST_DUE | CANCELLED | SUSPENDED
}

// Гард для страниц. Возвращает пользователя + tenant-ограниченный клиент.
// Не та роль — редирект на «свой» дом, а не 403-заглушка.
export async function requireRole(...allowed: Role[]): Promise<{ user: SessionUser; db: ReturnType<typeof tenantDb> }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (allowed.length && !allowed.includes(user.role)) redirect(homeFor(user.role));
  const db = tenantDb(user.organizationId);
  if (await isBillingBlocked(db, user.organizationId)) redirect("/billing/expired");
  return { user, db };
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
  const db = tenantDb(user.organizationId);
  if (await isBillingBlocked(db, user.organizationId)) throw new AuthError(402, "Подписка приостановлена — обратитесь к владельцу");
  return { user, db };
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
