"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminTabs() {
  const path = usePathname();
  const tabs = [
    { href: "/admin", label: "Товары" },
    { href: "/admin/assistant", label: "Приёмка ИИ" },
    { href: "/admin/receipts", label: "Чеки за день" },
    { href: "/admin/debts", label: "Долги" },
    { href: "/admin/staff", label: "Сотрудники" },
  ];
  return (
    <div className="flex gap-1 border-b border-line mb-5 -mt-1 overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
      {tabs.map((t) => {
        const active = t.href === "/admin" ? path === "/admin" : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 pb-2.5 pt-1.5 sm:pb-2 sm:pt-1 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
              active ? "border-stamp text-ink" : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
