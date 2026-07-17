"use server";
import { redirect } from "next/navigation";
import { registerOrganization, RegisterError } from "@/server/services/onboarding";
import { createSession, setSessionCookie } from "@/server/auth";
import type { OrgType } from "@prisma/client";

export async function registerAction(_prev: unknown, formData: FormData) {
  const input = {
    orgName: String(formData.get("orgName") ?? ""),
    orgType: (String(formData.get("orgType") ?? "RETAIL") as OrgType),
    storeName: String(formData.get("storeName") ?? ""),
    storeAddress: String(formData.get("storeAddress") ?? ""),
    ownerName: String(formData.get("ownerName") ?? ""),
    login: String(formData.get("login") ?? ""),
    password: String(formData.get("password") ?? ""),
  };
  try {
    const { owner } = await registerOrganization(input);
    const token = await createSession(owner.id);
    await setSessionCookie(token);
  } catch (e) {
    if (e instanceof RegisterError) return { error: e.message };
    console.error(e);
    return { error: "Не удалось зарегистрировать. Попробуйте ещё раз." };
  }
  redirect("/owner");
}
