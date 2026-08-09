"use server";
import { redirect } from "next/navigation";
import { getRawSessionToken, logout } from "@/server/auth";
import { endImpersonation } from "@/server/services/rootAdmin";

// Кнопка возврата в баннере AppShell — гасит именно сессию-подмену (не
// трогает torgos_root_session, супер-админ остаётся залогинен в /root)
// и пишет impersonate_end в аудит-лог.
export async function endImpersonationAction() {
  const token = await getRawSessionToken();
  if (token) await endImpersonation(token);
  await logout();
  redirect("/root");
}
