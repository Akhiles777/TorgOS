// Каркас супер-админки — функциональный, не парадный: плотные таблицы, ноль
// маркетингового тона. Токены те же, что в остальном приложении (одна
// система на весь продукт), но без чек-ленточных мотивов — это внутренний
// инструмент, а не витрина для арендатора.
import "@fontsource-variable/golos-text/wght.css";
import "@fontsource/jetbrains-mono/400.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { rootLogoutAction } from "@/app/root/logout/action";

const LINKS = [
  { href: "/root", label: "Дашборд" },
  { href: "/root/organizations", label: "Организации" },
  { href: "/root/analytics", label: "Аналитика" },
  { href: "/root/users", label: "Пользователи" },
  { href: "/root/audit", label: "Аудит" },
];

export function RootShell({ active, adminName, children }: { active: string; adminName: string; children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col font-app-text bg-paper text-ink text-sm">
      <header className="sticky top-0 z-30 bg-ink text-paper">
        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center gap-4">
          <span className="font-app-mono font-semibold text-xs tracking-wide uppercase text-paper/70">ТоргОС · root</span>
          <nav className="flex gap-1 flex-1">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-2.5 h-8 inline-flex items-center rounded-tag text-[13px] font-medium ${
                  active === l.href ? "bg-paper text-ink" : "text-paper/70 hover:text-paper hover:bg-paper/10"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <span className="text-xs text-paper/60">{adminName}</span>
          <form action={rootLogoutAction}>
            <button type="submit" className="text-xs text-paper/60 hover:text-paper">
              Выйти
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-5">{children}</main>
    </div>
  );
}
