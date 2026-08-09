import { redirect } from "next/navigation";
import { getCurrentSuperAdmin, type SuperAdminUser } from "./superAdminAuth";

export class SuperAdminAuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Для страниц /root/*.
export async function requireSuperAdmin(): Promise<SuperAdminUser> {
  const sa = await getCurrentSuperAdmin();
  if (!sa) redirect("/root/login");
  return sa;
}

// Для server actions под /root — бросает вместо редиректа.
export async function requireSuperAdminApi(): Promise<SuperAdminUser> {
  const sa = await getCurrentSuperAdmin();
  if (!sa) throw new SuperAdminAuthError(401, "Требуется вход в root");
  return sa;
}
