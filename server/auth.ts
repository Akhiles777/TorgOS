// Аутентификация: самописные сессии по «луциевскому» паттерну.
//
// Почему не NextAuth и не библиотека Lucia: Lucia как пакет объявлен deprecated,
// автор рекомендует держать сессии в своём коде; NextAuth избыточен для
// логина по паре login+пароль без OAuth. Здесь ~80 строк, полный контроль,
// ноль зависимостей сверх bcrypt: непрозрачный токен в httpOnly-cookie,
// в БД лежит только его sha256 — утечка таблицы Session не даёт войти.

import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { compare } from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "./db";

const COOKIE = "torgos_session";
const TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 дней
const RENEW_MS = 1000 * 60 * 60 * 24 * 15; // продлеваем, если осталось < 15 дней

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export type SessionUser = {
  id: string;
  name: string;
  login: string;
  role: Role;
  organizationId: string;
  storeId: string | null;
};

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await prisma.session.create({
    data: { id: sha256(token), userId, expiresAt: new Date(Date.now() + TTL_MS) },
  });
  return token;
}

async function resolveToken(token: string): Promise<SessionUser | null> {
  const id = sha256(token);
  const session = await prisma.session.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id } }).catch(() => {});
    return null;
  }
  // Скользящее продление
  if (session.expiresAt.getTime() - Date.now() < RENEW_MS) {
    await prisma.session.update({ where: { id }, data: { expiresAt: new Date(Date.now() + TTL_MS) } });
  }
  const u = session.user;
  return { id: u.id, name: u.name, login: u.login, role: u.role, organizationId: u.organizationId, storeId: u.storeId };
}

// Текущий пользователь или null. Кэшируется в рамках запроса вызывающим при желании.
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  return resolveToken(token);
}

export async function login(loginName: string, password: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({ where: { login: loginName.trim().toLowerCase() } });
  if (!user) {
    await compare(password, "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinva"); // выравниваем тайминг
    return null;
  }
  if (!(await compare(password, user.passwordHash))) return null;
  const token = await createSession(user.id);
  await setSessionCookie(token);
  return { id: user.id, name: user.name, login: user.login, role: user.role, organizationId: user.organizationId, storeId: user.storeId };
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_MS / 1000,
  });
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await prisma.session.delete({ where: { id: sha256(token) } }).catch(() => {});
    jar.delete(COOKIE);
  }
}
