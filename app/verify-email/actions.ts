"use server";
import { getCurrentUser } from "@/server/auth";
import { tenantDb } from "@/server/tenant";

// Подтверждение почты — не блокирует доступ (сразу после /register уже можно
// работать), просто снимает мягкий баннер. Код печатается в консоль сервера
// (server/email/sender.ts::ConsoleEmailSender), пока нет реального SMTP.
export async function verifyEmailAction(_prev: unknown, formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Не авторизованы" };

  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Введите код из письма" };

  const db = tenantDb(user.organizationId);
  const record = await db.user.findFirst({
    where: { id: user.id },
    select: { emailVerifyCode: true, emailVerifyCodeExpiresAt: true },
  });
  if (!record?.emailVerifyCode || record.emailVerifyCode !== code) return { error: "Неверный код" };
  if (!record.emailVerifyCodeExpiresAt || record.emailVerifyCodeExpiresAt < new Date()) {
    return { error: "Код истёк — обратитесь в поддержку за новым" };
  }

  await db.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date(), emailVerifyCode: null, emailVerifyCodeExpiresAt: null },
  });
  return { ok: true };
}
