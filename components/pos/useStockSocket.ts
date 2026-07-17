"use client";
import { useEffect, useRef, useState } from "react";
import type { StockUpdate } from "@/server/realtime";

type Status = "connecting" | "online" | "offline";

// Живая синхронизация остатков между кассами точки.
// Соединение авторизуется cookie-сессией на стороне сервера (storeId берётся оттуда).
export function useStockSocket(onStock: (updates: StockUpdate[], saleNumber?: number) => void) {
  const [status, setStatus] = useState<Status>("connecting");
  const cbRef = useRef(onStock);

  useEffect(() => {
    cbRef.current = onStock;
  }, [onStock]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => setStatus("online");
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "stock") cbRef.current(msg.updates as StockUpdate[], msg.saleNumber);
        } catch {
          /* игнорируем битые кадры */
        }
      };
      ws.onclose = () => {
        setStatus("offline");
        if (!closed) retry = setTimeout(connect, 2000);
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

  return status;
}
