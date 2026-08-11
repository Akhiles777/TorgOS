"use client";
import { useEffect, useRef, useState } from "react";

type Status = "connecting" | "online" | "offline";

// Живой статус агентов точки — тот же WS/реконнект, что useStockSocket.ts,
// сервер сам знает storeId из cookie-сессии, клиент его не передаёт.
export function useAgentStatus(onAgentStatus: (agentId: string, status: "PENDING" | "ONLINE" | "OFFLINE") => void) {
  const [status, setStatus] = useState<Status>("connecting");
  const cbRef = useRef(onAgentStatus);

  useEffect(() => {
    cbRef.current = onAgentStatus;
  }, [onAgentStatus]);

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
          if (msg.type === "agent-status") cbRef.current(msg.agentId as string, msg.status);
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
