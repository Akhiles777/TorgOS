import Link from "next/link";
import type { ReactNode } from "react";
import type { Role } from "@prisma/client";
import { logoutAction } from "@/app/logout/action";
import { RestockBanner } from "@/components/RestockBanner";

// Каркас админки и кабинета. Касса своего каркаса не имеет — там всё подчинено чеку.
export function AppShell({
  role,
  userName,
  active,
  children,
}: {
  role: Role;
  userName: string;
  active: "admin" | "owner";
  children: ReactNode;
}) {
  const links: { href: string; label: string; show: boolean }[] = [
    { href: "/owner", label: "Кабинет", show: role === "OWNER" },
    { href: "/admin", label: "Точка", show: role === "OWNER" || role === "ADMIN" },
    { href: "/pos", label: "Касса", show: role === "ADMIN" },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <RestockBanner />
      <header className="sticky top-0 z-30 bg-paper/95 backdrop-blur border-b border-line">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4">
          <span className="font-mono-nums font-bold text-lg">ТоргОС</span>
          <nav className="flex gap-1 flex-1">
            {links.filter((l) => l.show).map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 h-9 inline-flex items-center rounded-tag text-sm font-medium ${
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
          <form action={logoutAction}>
            <button type="submit" className="text-sm text-ink-soft hover:text-stamp px-2">
              Выйти
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
