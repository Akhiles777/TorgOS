// Шрифты приложения — та же пара, что подключена в /pos (см. дизайн-план системы).
import "@fontsource-variable/unbounded/wght.css";
import "@fontsource-variable/golos-text/wght.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Role } from "@prisma/client";
import { logoutAction } from "@/app/logout/action";
import { endImpersonationAction } from "@/app/impersonate/actions";
import { RestockBanner } from "@/components/RestockBanner";
import { EmailVerifyBanner } from "@/components/EmailVerifyBanner";

// Каркас админки и кабинета. Касса своего каркаса не имеет — там всё подчинено чеку.
export function AppShell({
  role,
  userName,
  active,
  children,
  email,
  emailVerifiedAt,
  impersonating,
}: {
  role: Role;
  userName: string;
  active: "admin" | "owner";
  children: ReactNode;
  email?: string | null;
  emailVerifiedAt?: Date | null;
  impersonating?: boolean;
}) {
  const links: { href: string; label: string; show: boolean }[] = [
    { href: "/owner", label: "Кабинет", show: role === "OWNER" },
    { href: "/admin", label: "Точка", show: role === "OWNER" || role === "ADMIN" },
    { href: "/pos", label: "Касса", show: role === "ADMIN" },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col font-app-text">
      {impersonating && (
        <div className="bg-warn text-ink px-3 sm:px-4 py-2 text-sm flex items-center justify-between gap-3">
          <span>Вы вошли как <strong>{userName}</strong> через супер-админку — действия видны в аудит-логе.</span>
          <form action={endImpersonationAction} className="shrink-0">
            <button type="submit" className="h-8 px-3 rounded-tag bg-ink text-paper text-xs font-medium hover:brightness-110">
              Вернуться в root
            </button>
          </form>
        </div>
      )}
      {email && !emailVerifiedAt && <EmailVerifyBanner email={email} />}
      <RestockBanner />
      <header className="sticky top-0 z-30 bg-paper/95 backdrop-blur border-b border-line">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 flex items-center gap-2 sm:gap-4">
          <span className="font-app-display font-bold text-base sm:text-lg shrink-0">ТоргОС</span>
          <nav className="flex gap-1 flex-1 overflow-x-auto">
            {links.filter((l) => l.show).map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-2.5 sm:px-3 h-9 inline-flex items-center rounded-tag text-sm font-medium whitespace-nowrap ${
                  (active === "owner" && l.href === "/owner") || (active === "admin" && l.href === "/admin")
                    ? "bg-ink text-paper"
                    : "text-ink-soft hover:bg-paper-2"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <span className="text-sm text-ink-soft hidden sm:block">{userName}</span>
          <form action={logoutAction} className="shrink-0">
            <button type="submit" className="text-sm text-ink-soft hover:text-stamp-text px-1.5 sm:px-2">
              Выйти
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-4 py-4 sm:py-6">{children}</main>
    </div>
  );
}
