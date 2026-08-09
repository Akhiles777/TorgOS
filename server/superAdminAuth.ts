// Аутентификация супер-админа — полностью отдельный стек от обычных
// пользователей (server/auth.ts): своя кука, свои сессии, ноль пересечений.
// Тот же «луциевский» паттерн (opaque-токен в httpOnly cookie, в БД —
// только sha256), но короче живёт: это доступ уровня «весь SaaS», не одна
// организация — компрометация обходится дороже, поэтому сессия короче и
// продлевается реже.
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { compare } from "bcryptjs";
import { prisma } from "./db";

const COOKIE = "torgos_root_session";
const TTL_MS = 1000 * 60 * 60 * 12; // 12 часов
const RENEW_MS = 1000 * 60 * 60 * 3; // продлеваем, если осталось < 3 часов

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export type SuperAdminUser = { id: string; email: string; name: string };

export async function createSuperAdminSession(superAdminId: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await prisma.superAdminSession.create({
    data: { id: sha256(token), superAdminId, expiresAt: new Date(Date.now() + TTL_MS) },
  });
  return token;
}

async function resolveToken(token: string): Promise<SuperAdminUser | null> {
  const id = sha256(token);
  const session = await prisma.superAdminSession.findUnique({ where: { id }, include: { superAdmin: true } });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.superAdminSession.delete({ where: { id } }).catch(() => {});
    return null;
  }
  if (session.expiresAt.getTime() - Date.now() < RENEW_MS) {
    await prisma.superAdminSession.update({ where: { id }, data: { expiresAt: new Date(Date.now() + TTL_MS) } });
  }
  const sa = session.superAdmin;
  return { id: sa.id, email: sa.email, name: sa.name };
}

export async function getCurrentSuperAdmin(): Promise<SuperAdminUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  return resolveToken(token);
}

export async function superAdminLogin(email: string, password: string): Promise<SuperAdminUser | null> {
  const sa = await prisma.superAdmin.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!sa) {
    await compare(password, "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinva"); // выравниваем тайминг
    return null;
  }
  if (!(await compare(password, sa.passwordHash))) return null;
  await prisma.superAdmin.update({ where: { id: sa.id }, data: { lastLoginAt: new Date() } });
  const token = await createSuperAdminSession(sa.id);
  await setSuperAdminSessionCookie(token);
  return { id: sa.id, email: sa.email, name: sa.name };
}

export async function setSuperAdminSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_MS / 1000,
  });
}

export async function superAdminLogout() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await prisma.superAdminSession.delete({ where: { id: sha256(token) } }).catch(() => {});
    jar.delete(COOKIE);
  }
}
