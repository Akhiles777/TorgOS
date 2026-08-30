import { requireStoreScope } from "@/server/guard";
import { listProducts, listCategories, type ProductFilter } from "@/server/services/products";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "./AdminTabs";
import { ProductsManager } from "./ProductsManager";

export const dynamic = "force-dynamic";

const FILTERS: ProductFilter[] = ["all", "low", "expiring", "inactive"];

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string; category?: string }>;
}) {
  const { user, db, storeId } = await requireStoreScope("ADMIN", "OWNER");
  const sp = await searchParams;
  const filter = (FILTERS.includes(sp.filter as ProductFilter) ? sp.filter : "all") as ProductFilter;
  const [products, categories] = await Promise.all([
    listProducts(db, storeId, filter, sp.q, sp.category),
    listCategories(db, storeId),
  ]);

  return (
    <AppShell role={user.role} userName={user.name} active="admin" email={user.email} emailVerifiedAt={user.emailVerifiedAt} impersonating={user.impersonating}>
      <AdminTabs />
      <ProductsManager
        products={products}
        filter={filter}
        query={sp.q ?? ""}
        categories={categories}
        category={sp.category ?? ""}
      />
    </AppShell>
  );
}
