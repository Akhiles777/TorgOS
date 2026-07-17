// Регистрация организации → первая точка → пользователь-владелец. Одна транзакция.
import { prisma } from "../db";
import { hash } from "bcryptjs";
import type { OrgType } from "@prisma/client";

export type RegisterInput = {
  orgName: string;
  orgType: OrgType;
  storeName: string;
  storeAddress: string;
  ownerName: string;
  login: string;
  password: string;
};

export class RegisterError extends Error {}

export async function registerOrganization(input: RegisterInput) {
  const login = input.login.trim().toLowerCase();
  if (login.length < 3) throw new RegisterError("Логин слишком короткий");
  if (input.password.length < 6) throw new RegisterError("Пароль минимум 6 символов");
  if (!input.orgName.trim()) throw new RegisterError("Укажите название организации");

  const exists = await prisma.user.findUnique({ where: { login } });
  if (exists) throw new RegisterError("Такой логин уже занят");

  const passwordHash = await hash(input.password, 10);

  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: { name: input.orgName.trim(), type: input.orgType, plan: "TRIAL" },
    });
    const store = await tx.store.create({
      data: { organizationId: org.id, name: input.storeName.trim() || "Точка 1", address: input.storeAddress.trim() },
    });
    // Владелец видит все точки организации, поэтому storeId не привязываем
    const owner = await tx.user.create({
      data: { organizationId: org.id, role: "OWNER", name: input.ownerName.trim() || "Владелец", login, passwordHash },
    });
    return { org, store, owner };
  });
}
