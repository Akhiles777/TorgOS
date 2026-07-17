"use server";
import { redirect } from "next/navigation";
import { login } from "@/server/auth";
import { homeFor } from "@/server/guard";

export async function loginAction(_prev: unknown, formData: FormData) {
  const loginName = String(formData.get("login") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!loginName || !password) return { error: "Введите логин и пароль" };

  const user = await login(loginName, password);
  if (!user) return { error: "Неверный логин или пароль" };
  redirect(homeFor(user.role));
}
