// Серверная обёртка: список вкладок зависит от типа организации (HORECA
// получает «Меню»/«Рецепты»/«Производство» — розница их не видит, RETAIL-набор
// ниже не изменился ни на символ). Сама разметка — в клиентском AdminTabsNav.
import { getCurrentUser } from "@/server/auth";
import { tenantDb } from "@/server/tenant";
import { getOrgType } from "@/server/org";
import { AdminTabsNav, type AdminTab } from "./AdminTabsNav";

const RETAIL_TABS: AdminTab[] = [
  { href: "/admin", label: "Товары" },
  { href: "/admin/assistant", label: "Приёмка ИИ" },
  { href: "/admin/inventory", label: "Инвентаризация" },
  { href: "/admin/receipts", label: "Чеки за день" },
  { href: "/admin/debts", label: "Долги" },
  { href: "/admin/staff", label: "Сотрудники" },
  // Реже используемые разделы — намеренно последними в списке вкладок.
  { href: "/admin/import", label: "Импорт" },
  { href: "/admin/cameras", label: "Камеры" },
];

// Вставляются сразу после «Товаров» (склад ингредиентов) — «Производство»
// добавится сюда же по мере готовности соответствующего экрана.
const HORECA_EXTRA_TABS: AdminTab[] = [
  { href: "/admin/menu", label: "Меню" },
  { href: "/admin/recipes", label: "Рецепты" },
];

export async function AdminTabs() {
  const user = await getCurrentUser();
  const tabs = [...RETAIL_TABS];
  if (user) {
    const orgType = await getOrgType(tenantDb(user.organizationId), user.organizationId);
    if (orgType === "HORECA") tabs.splice(1, 0, ...HORECA_EXTRA_TABS);
  }
  return <AdminTabsNav tabs={tabs} />;
}
