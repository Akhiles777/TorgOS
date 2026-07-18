// Мост между Next (API-роуты) и WS-сервером. Оба живут в одном Node-процессе
// (custom server в server.mjs), поэтому связь — через глобальный синглтон.

export type StockUpdate = { productId: string; stock: number };
export type RealtimeMessage =
  | { type: "stock"; storeId: string; updates: StockUpdate[]; saleNumber?: number }
  | { type: "restock"; storeId: string; count: number; by?: string }
  | { type: "hello" };

type Broadcaster = (storeId: string, updates: StockUpdate[], saleNumber?: number) => void;
// Отправка произвольного сообщения всем клиентам комнаты точки.
type MsgBroadcaster = (storeId: string, message: Record<string, unknown>) => void;

const g = globalThis as unknown as { __torgosBroadcast?: Broadcaster; __torgosBroadcastMsg?: MsgBroadcaster };

export function registerBroadcaster(fn: Broadcaster) {
  g.__torgosBroadcast = fn;
}
export function registerMsgBroadcaster(fn: MsgBroadcaster) {
  g.__torgosBroadcastMsg = fn;
}

export function broadcastStock(storeId: string, updates: StockUpdate[], saleNumber?: number) {
  g.__torgosBroadcast?.(storeId, updates, saleNumber);
}

// Уведомление «поступил товар» — все открытые экраны точки покажут баннер
// с рекомендацией обновить страницу (не автообновление: на кассе может идти чек).
export function broadcastRestock(storeId: string, count: number, by?: string) {
  g.__torgosBroadcastMsg?.(storeId, { type: "restock", storeId, count, by });
}
