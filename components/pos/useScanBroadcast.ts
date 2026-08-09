"use client";
import { useEffect, useRef, useState } from "react";

type Status = "connecting" | "online" | "offline";

// Отправка кодов на /ws — обратная сторона useRemoteScan. Соединение
// авторизуется той же cookie-сессией на сервере (см. server.mjs::resolveStore),
// поэтому телефон и касса должны быть в одной точке — сервер сам это проверяет
// по storeId, довериться клиенту тут нельзя.
export function useScanBroadcast() {
  const [status, setStatus] = useState<Status>("connecting");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      wsRef.current = ws;
      ws.onopen = () => setStatus("online");
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

  const send = (code: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "scan", code }));
      return true;
    }
    return false;
  };

  return { status, send };
}
