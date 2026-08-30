import { requireStoreScope } from "@/server/guard";
import { getOrgType } from "@/server/org";
import { loadPosProducts } from "@/server/services/pos";
import { loadHorecaMenu, listOpenOrders } from "@/server/services/horeca/pos";
import { listEmployees, getCurrentShift } from "@/server/services/shift";
import { PosScreen } from "@/components/pos/PosScreen";
import { HorecaPosScreen } from "@/components/pos/horeca/HorecaPosScreen";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  // Кассой пользуются владелец и админы (Гасан, Земфира, Рита — один вход,
  // а «кто на смене» выбирается тапом).
  const { user, db, storeId } = await requireStoreScope("OWNER", "ADMIN", "CASHIER");
  const orgType = await getOrgType(db, user.organizationId);

  const [employees, shift] = await Promise.all([listEmployees(db, storeId), getCurrentShift(db, storeId)]);
  const currentShift = shift ? { id: shift.employee.id, name: shift.employee.name } : null;

  if (orgType === "HORECA") {
    const [menu, openOrders, store] = await Promise.all([
      loadHorecaMenu(db, storeId),
      listOpenOrders(db, storeId),
      db.store.findUnique({ where: { id: storeId }, select: { name: true } }),
    ]);
    return (
      <HorecaPosScreen
        menu={menu}
        initialOpenOrders={openOrders}
        storeName={store?.name ?? ""}
        accountName={user.name}
        employees={employees}
        currentShift={currentShift}
        impersonating={user.impersonating}
      />
    );
  }

  const products = await loadPosProducts(db, storeId);
  return (
    <PosScreen
      initialProducts={products}
      accountName={user.name}
      employees={employees}
      currentShift={currentShift}
      impersonating={user.impersonating}
      // Ключ локального черновика чека: у разных точек свои незакрытые чеки.
      storeId={storeId}
    />
  );
}
