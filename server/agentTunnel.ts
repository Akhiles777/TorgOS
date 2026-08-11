// Типизированный мост к WS-туннелю агента, который живёт в server.mjs (тот
// же процесс, общий globalThis) — та же схема, что server/realtime.ts для
// комнат /ws. server.mjs кладёт функции на globalThis при старте; здесь
// только читаем и типизируем для API-роутов.
import type { Readable } from "node:stream";

export class AgentOfflineError extends Error {
  constructor() {
    super("Агент точки офлайн — камера временно недоступна");
  }
}

export class AgentTimeoutError extends Error {
  constructor() {
    super("Агент точки не ответил вовремя");
  }
}

export type AgentProxyRequest = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: Buffer;
  timeoutMs?: number;
};

export type AgentProxyResponse = {
  status: number;
  headers: Record<string, string>;
  body: Readable;
};

type ProxyFn = (agentId: string, req: AgentProxyRequest) => Promise<AgentProxyResponse>;
type OnlineFn = (agentId: string) => boolean;

const g = globalThis as unknown as { __torgosAgentProxy?: ProxyFn; __torgosAgentOnline?: OnlineFn };

export function isAgentOnline(agentId: string): boolean {
  return g.__torgosAgentOnline?.(agentId) ?? false;
}

export async function proxyToAgent(agentId: string, req: AgentProxyRequest): Promise<AgentProxyResponse> {
  if (!g.__torgosAgentProxy) throw new AgentOfflineError();
  try {
    return await g.__torgosAgentProxy(agentId, req);
  } catch (e) {
    const code = (e as { code?: string } | undefined)?.code;
    if (code === "AGENT_OFFLINE") throw new AgentOfflineError();
    if (code === "AGENT_TIMEOUT") throw new AgentTimeoutError();
    throw e;
  }
}
