"use client";
import { useEffect, useState } from "react";

// Слушает WS-событие «поступил товар» и показывает баннер с РЕКОМЕНДАЦИЕЙ
// обновить страницу — намеренно НЕ автообновление: на кассе может идти чек,
// и внезапный reload сбросил бы корзину. Кассир/админ обновит сам, когда удобно.
export function RestockBanner() {
  const [info, setInfo] = useState<{ count: number; by?: string } | null>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "restock") setInfo({ count: msg.count, by: msg.by });
        } catch {
          /* игнор */
        }
      };
      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, []);

  if (!info) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[70] bg-fresh text-stamp-ink shadow-lg">
      <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium">
          Поступил товар{info.count ? ` (${info.count} поз.)` : ""}{info.by ? ` — ${info.by}` : ""}. Рекомендуем обновить страницу.
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => location.reload()}
            className="h-8 px-3 rounded-tag bg-stamp-ink text-fresh text-sm font-medium hover:brightness-95"
          >
            Обновить
          </button>
          <button onClick={() => setInfo(null)} className="h-8 w-8 grid place-items-center text-lg" aria-label="Скрыть">
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
