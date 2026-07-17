// Мост между Next (API-роуты) и WS-сервером. Оба живут в одном Node-процессе
// (custom server в server.mjs), поэтому связь — через глобальный синглтон.
// API после продажи зовёт broadcastStock(); WS-сервер регистрирует свой отправитель.

export type StockUpdate = { productId: string; stock: number };
export type RealtimeMessage =
  | { type: "stock"; storeId: string; updates: StockUpdate[]; saleNumber?: number }
  | { type: "hello"; stocks: Record<string, number> };

type Broadcaster = (storeId: string, updates: StockUpdate[], saleNumber?: number) => void;

const g = globalThis as unknown as { __torgosBroadcast?: Broadcaster };

export function registerBroadcaster(fn: Broadcaster) {
  g.__torgosBroadcast = fn;
}

export function broadcastStock(storeId: string, updates: StockUpdate[], saleNumber?: number) {
  g.__torgosBroadcast?.(storeId, updates, saleNumber);
}
