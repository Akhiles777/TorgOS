// Общие типы кассы/заказов общепита — переиспользуются read-стороной
// (pos.ts) и write/pay-стороной (orders.ts).

// Снимок выбранного модификатора на момент добавления в заказ — хранится в
// OrderItem.modifiers (Json). Фиксирован, чтобы правка модификатора в
// /admin/menu не поменяла задним числом уже пробитый или отложенный заказ.
export type SelectedModifierSnapshot = {
  modifierId: string;
  name: string;
  priceDelta: number;
  addProductId: string | null;
  addQuantity: number | null;
  replacesProductId: string | null;
};

// Черновик строки заказа, приходит от клиента — БЕЗ цены (клиентским деньгам
// не доверяем, ровно тот же принцип, что в server/services/pos.ts::commitSale).
export type DraftLine = {
  menuItemId: string;
  quantity: number;
  modifierIds: string[];
  comment?: string | null;
};
