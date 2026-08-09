// Регистрация организации → первая точка → пользователь-владелец. Одна транзакция.
// Самостоятельная регистрация: логином владельца становится email (см. дизайн-план
// Фазы 2) — отдельного поля «логин» на /register больше нет, сотрудникам без
// почты владелец заводит произвольный логин внутри кабинета, как и раньше.
import { prisma } from "../db";
import { hash } from "bcryptjs";
import type { OrgType } from "@prisma/client";
import { emailSender } from "../email/sender";
import { demoProducts } from "@/lib/demoProducts";

export type RegisterInput = {
  orgName: string;
  orgType: OrgType;
  storeName: string;
  storeAddress: string;
  storeCity: string;
  ownerName: string;
  email: string;
  password: string;
  demoProducts: boolean;
};

export class RegisterError extends Error {}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TRIAL_DAYS = 14;
const VERIFY_TTL_MS = 24 * 3600_000;

function generateVerifyCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 цифр
}

export async function registerOrganization(input: RegisterInput) {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new RegisterError("Укажите настоящий email — он же логин для входа");
  if (input.password.length < 6) throw new RegisterError("Пароль минимум 6 символов");
  if (!input.orgName.trim()) throw new RegisterError("Укажите название организации");

  const exists = await prisma.user.findFirst({ where: { OR: [{ login: email }, { email }] } });
  if (exists) throw new RegisterError("Такой email уже зарегистрирован — войдите или восстановите доступ");

  const passwordHash = await hash(input.password, 10);
  const verifyCode = generateVerifyCode();
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 86_400_000);

  const { org, store, owner } = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: input.orgName.trim(),
        type: input.orgType,
        plan: "TRIAL",
        subscriptionStatus: "TRIAL",
        trialEndsAt,
      },
    });
    const store = await tx.store.create({
      data: {
        organizationId: org.id,
        name: input.storeName.trim() || "Точка 1",
        address: input.storeAddress.trim(),
        city: input.storeCity.trim() || null,
      },
    });
    // Владелец видит все точки организации, поэтому storeId не привязываем
    const owner = await tx.user.create({
      data: {
        organizationId: org.id,
        role: "OWNER",
        name: input.ownerName.trim() || "Владелец",
        login: email,
        email,
        passwordHash,
        emailVerifyCode: verifyCode,
        emailVerifyCodeExpiresAt: new Date(now.getTime() + VERIFY_TTL_MS),
      },
    });

    if (input.demoProducts) {
      const products = demoProducts();
      await tx.product.createMany({
        data: products.map((p) => ({
          storeId: store.id,
          name: p.name,
          category: p.category,
          price: p.price,
          costPrice: p.costPrice,
          unit: p.unit,
          stock: p.stock,
          barcode: p.barcode,
          showInPos: p.showInPos,
          isActive: true,
        })),
      });
    }

    return { org, store, owner };
  });

  // Верификация не блокирует вход (сразу редирект в кабинет) — письмо просто
  // отправляется параллельно, мягкий баннер в интерфейсе просит подтвердить позже.
  await emailSender.send({
    to: email,
    subject: "Подтвердите почту — ТоргОС",
    text: `Здравствуйте, ${owner.name || "владелец"}!\n\nВаш код подтверждения: ${verifyCode}\n\nОн понадобится, если вы захотите восстановить доступ. Действует 24 часа.\n\nМагазин «${store.name}» уже создан, входить можно прямо сейчас.`,
  });

  return { org, store, owner };
}
