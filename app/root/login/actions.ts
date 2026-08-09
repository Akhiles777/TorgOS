"use server";
import { redirect } from "next/navigation";
import { superAdminLogin } from "@/server/superAdminAuth";

export async function rootLoginAction(_prev: unknown, formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const sa = await superAdminLogin(email, password);
  if (!sa) return { error: "Неверный email или пароль" };
  redirect("/root");
}
