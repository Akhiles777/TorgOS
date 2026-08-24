// Меню и открытые заказы для кассы общепита. Отдельно от horeca/menu.ts —
// тот отдаёт данные для админского CRUD-экрана (себестоимость, наценка и
// т.п.), здесь — только то, что нужно кассе для показа плиток и оплаты.
import type { TenantDb } from "../../tenant";
import { toNum } from "@/lib/format";
import type { SelectedModifierSnapshot } from "./types";

export type PosModifier = {
  id: string;
  name: string;
  priceDelta: number;
  addProductId: string | null;
  addQuantity: number | null;
  replacesProductId: string | null;
};
export type PosModifierGroup = { id: string; name: string; isRequired: boolean; maxChoices: number; modifiers: PosModifier[] };
export type PosMenuItem = { id: string; name: string; price: number; categoryId: string | null; modifierGroups: PosModifierGroup[] };
export type PosMenuCategory = { id: string; name: string };

export async function loadHorecaMenu(db: TenantDb, storeId: string): Promise<{ categories: PosMenuCategory[]; items: PosMenuItem[] }> {
  const [categories, items] = await Promise.all([
    db.menuCategory.findMany({
      where: { storeId, isActive: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    db.menuItem.findMany({
      where: { storeId, isActive: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      include: {
        modifierGroups: {
          include: { group: { include: { modifiers: { where: { isActive: true }, orderBy: { position: "asc" } } } } },
          orderBy: { position: "asc" },
        },
      },
    }),
  ]);
  return {
    categories,
    items: items.map((i) => ({
      id: i.id, name: i.name, price: toNum(i.price), categoryId: i.categoryId,
      modifierGroups: i.modifierGroups.map((mg) => ({
        id: mg.group.id, name: mg.group.name, isRequired: mg.group.isRequired, maxChoices: mg.group.maxChoices,
        modifiers: mg.group.modifiers.map((m) => ({
          id: m.id, name: m.name, priceDelta: toNum(m.priceDelta),
          addProductId: m.addProductId, addQuantity: m.addQuantity != null ? toNum(m.addQuantity) : null,
          replacesProductId: m.replacesProductId,
        })),
      })),
    })),
  };
}

// Отложенные заказы («лента» на кассе) — статус OPEN, ещё не оплачены.
export type OpenOrderRow = { id: string; number: number; total: number; itemCount: number; createdAt: string };

export async function listOpenOrders(db: TenantDb, storeId: string): Promise<OpenOrderRow[]> {
  const orders = await db.order.findMany({
    where: { storeId, status: "OPEN" },
    orderBy: { createdAt: "asc" },
    include: { items: { select: { quantity: true, priceAtSale: true } } },
  });
  return orders.map((o) => ({
    id: o.id,
    number: o.number,
    total: o.items.reduce((s, it) => s + toNum(it.priceAtSale) * toNum(it.quantity), 0),
    itemCount: o.items.length,
    createdAt: o.createdAt.toISOString(),
  }));
}

export type OpenOrderItem = {
  menuItemId: string;
  name: string;
  quantity: number;
  priceAtSale: number;
  modifiers: SelectedModifierSnapshot[] | null;
  comment: string | null;
};
export type OpenOrderDetail = { id: string; number: number; items: OpenOrderItem[] };

export async function getOpenOrder(db: TenantDb, orderId: string): Promise<OpenOrderDetail | null> {
  const order = await db.order.findFirst({ where: { id: orderId, status: "OPEN" }, include: { items: true } });
  if (!order) return null;
  return {
    id: order.id,
    number: order.number,
    items: order.items.map((it) => ({
      menuItemId: it.menuItemId, name: it.nameAtSale, quantity: toNum(it.quantity), priceAtSale: toNum(it.priceAtSale),
      modifiers: it.modifiers as SelectedModifierSnapshot[] | null, comment: it.comment,
    })),
  };
}
