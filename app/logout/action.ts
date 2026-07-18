"use server";
import { redirect } from "next/navigation";
import { logout } from "@/server/auth";

// Выход — ТОЛЬКО через POST-экшен (форма), никогда не через GET-ссылку.
// Раньше был GET-роут /logout, на который вёл <Link>. Next.js в проде
// префетчит <Link> в фоне — и префетч сам исполнял GET /logout, убивая
// сессию ещё до клика. Отсюда «постоянно выкидывает на вход». POST
// префетчем не вызывается, ссылки-превью и сканеры его тоже не триггерят.
export async function logoutAction() {
  await logout();
  redirect("/login");
}
