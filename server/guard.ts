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

// Для API-роутов: бросает, не редиректит.
export async function requireApi(...allowed: Role[]): Promise<{ user: SessionUser; db: ReturnType<typeof tenantDb> }> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError(401, "Требуется вход");
  if (allowed.length && !allowed.includes(user.role)) throw new AuthError(403, "Недостаточно прав");
  return { user, db: tenantDb(user.organizationId) };
}

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
