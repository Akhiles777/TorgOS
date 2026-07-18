import { requireStoreScope } from "@/server/guard";
import { loadPosProducts } from "@/server/services/pos";
import { listEmployees, getCurrentShift } from "@/server/services/shift";
import { PosScreen } from "@/components/pos/PosScreen";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  // Кассой пользуются владелец и админы (Гасан, Земфира, Рита — один вход,
  // а «кто на смене» выбирается тапом).
  const { user, db, storeId } = await requireStoreScope("OWNER", "ADMIN", "CASHIER");
  const [products, employees, shift] = await Promise.all([
    loadPosProducts(db, storeId),
    listEmployees(db, storeId),
    getCurrentShift(db, storeId),
  ]);
  return (
    <PosScreen
      initialProducts={products}
      accountName={user.name}
      employees={employees}
      currentShift={shift ? { id: shift.employee.id, name: shift.employee.name } : null}
    />
  );
}
