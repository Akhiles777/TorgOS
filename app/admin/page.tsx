import { redirect } from "next/navigation";
import { requireRole } from "@/server/guard";
import { listProducts, type ProductFilter } from "@/server/services/products";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "./AdminTabs";
import { ProductsManager } from "./ProductsManager";

export const dynamic = "force-dynamic";

const FILTERS: ProductFilter[] = ["all", "low", "expiring", "inactive"];

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string }> }) {
  const { user, db } = await requireRole("ADMIN", "OWNER");
  if (!user.storeId) redirect("/owner");
  const sp = await searchParams;
  const filter = (FILTERS.includes(sp.filter as ProductFilter) ? sp.filter : "all") as ProductFilter;
  const products = await listProducts(db, user.storeId, filter, sp.q);

  return (
    <AppShell role={user.role} userName={user.name} active="admin">
      <AdminTabs />
      <ProductsManager products={products} filter={filter} query={sp.q ?? ""} />
    </AppShell>
  );
}
