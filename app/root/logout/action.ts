"use server";
import { redirect } from "next/navigation";
import { superAdminLogout } from "@/server/superAdminAuth";

export async function rootLogoutAction() {
  await superAdminLogout();
  redirect("/root/login");
}
