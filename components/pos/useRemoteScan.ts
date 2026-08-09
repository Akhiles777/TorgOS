"use client";
import { useEffect, useRef } from "react";

// Приём кодов, отсканированных телефоном на /pos/scan — тот же WS-канал,
// что и остатки (useStockSocket), но своё соединение: в этом проекте у
// каждого назначения свой сокет на /ws (см. useStockSocket/RestockBanner),
// а не один мультиплексированный на всё приложение.
export function useRemoteScan(onCode: (code: string) => void) {
  const cbRef = useRef(onCode);

  useEffect(() => {
    cbRef.current = onCode;
  }, [onCode]);

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
          if (msg.type === "scan" && typeof msg.code === "string") cbRef.current(msg.code);
        } catch {
          /* игнорируем битые кадры */
        }
      };
      ws.onclose = () => {
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
}
