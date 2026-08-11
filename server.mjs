// Custom server: Next + WebSocket в одном процессе.
// WS-соединение авторизуется cookie-сессией (storeId берётся из БД, не от клиента),
// клиенты группируются в «комнаты» по точке. Продажа на одной кассе рассылает
// новые остатки всем кассам той же точки.
import { createServer } from "node:http";
import { parse } from "node:url";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import next from "next";
import { WebSocketServer } from "ws";
import { PrismaClient } from "@prisma/client";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const app = next({ dev });
const handle = app.getRequestHandler();
const prisma = new PrismaClient();

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// storeId -> Set<ws>
const rooms = new Map();

function joinRoom(storeId, ws) {
  if (!rooms.has(storeId)) rooms.set(storeId, new Set());
  rooms.get(storeId).add(ws);
  ws.on("close", () => rooms.get(storeId)?.delete(ws));
}

function sendToRoom(storeId, obj) {
  const room = rooms.get(storeId);
  if (!room) return;
  const payload = JSON.stringify(obj);
  for (const ws of room) if (ws.readyState === ws.OPEN) ws.send(payload);
}

function broadcast(storeId, updates, saleNumber) {
  sendToRoom(storeId, { type: "stock", storeId, updates, saleNumber });
}

// Мост к API-роутам Next: тот же процесс, общий globalThis.
globalThis.__torgosBroadcast = broadcast;
globalThis.__torgosBroadcastMsg = (storeId, message) => sendToRoom(storeId, message);

// ── Туннель до агента точки ("Камеры") ──────────────────────────────────
// Агент (мини-ПК/Raspberry Pi в магазине) сам открывает исходящее WS-соединение
// сюда — сервер к нему подключиться не может (агент за NAT магазина, порты
// наружу не открываем, см. отчёт по фиче). После регистрации по токену
// агент — просто «глупый» релей: сервер шлёт ему готовый {url,method,headers}
// (сам собирает URL с учётными данными, агент вообще не знает про вендоров и
// не хранит паролей), агент делает HTTP-запрос к своему локальному go2rtc и
// стримит ответ обратно кусками, не дожидаясь целиком (архивные файлы и
// HLS-сегменты бывают большими, а Content-Length заранее не всегда известен).
//
// agentId -> { ws, storeId, nextReqId, pending: Map<reqId, handlers> }
const agentConns = new Map();

function agentSend(conn, obj) {
  if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify(obj));
}

// Вызывается из API-роутов Next через globalThis (тот же процесс, та же
// схема моста, что у __torgosBroadcast) — шлёт запрос агенту и отдаёт
// {status, headers, body: Readable} как только придёт заголовок ответа,
// дальше тело льётся в этот Readable по мере поступления бинарных фреймов.
function proxyToAgent(agentId, req) {
  return new Promise((resolve, reject) => {
    const conn = agentConns.get(agentId);
    if (!conn) {
      reject(Object.assign(new Error("Агент офлайн"), { code: "AGENT_OFFLINE" }));
      return;
    }
    const id = conn.nextReqId++;
    const timeoutMs = req.timeoutMs ?? 8000;
    let headResolved = false;
    let bodyStream = null;

    const timer = setTimeout(() => {
      const pending = conn.pending.get(id);
      if (!pending) return;
      conn.pending.delete(id);
      if (!headResolved) {
        reject(Object.assign(new Error("Таймаут ответа от агента"), { code: "AGENT_TIMEOUT" }));
      } else {
        bodyStream?.destroy(new Error("Таймаут тела ответа"));
      }
      agentSend(conn, { type: "req-abort", id });
    }, timeoutMs);
    timer.unref();

    conn.pending.set(id, {
      onHead(status, headers) {
        headResolved = true;
        clearTimeout(timer);
        bodyStream = new Readable({ read() {} });
        resolve({ status, headers, body: bodyStream });
      },
      onChunk(buf) {
        bodyStream?.push(buf);
      },
      onEnd() {
        bodyStream?.push(null);
        conn.pending.delete(id);
      },
      onError(message) {
        clearTimeout(timer);
        if (!headResolved) reject(Object.assign(new Error(message), { code: "AGENT_ERROR" }));
        else bodyStream?.destroy(new Error(message));
        conn.pending.delete(id);
      },
    });

    agentSend(conn, {
      type: "req",
      id,
      url: req.url,
      method: req.method || "GET",
      headers: req.headers || {},
      bodyBase64: req.body ? Buffer.from(req.body).toString("base64") : undefined,
    });
  });
}

globalThis.__torgosAgentProxy = proxyToAgent;
globalThis.__torgosAgentOnline = (agentId) => agentConns.has(agentId);

// Debounce записи lastSeenAt в БД — как sliding-renewal сессий в server/auth.ts,
// не пишем на каждый heartbeat (раз в ~25с), а не чаще раза в ~60с.
const HEARTBEAT_DB_WRITE_MS = 60_000;

async function handleAgentConnection(ws, req) {
  let conn = null;
  let registered = false;

  const registerTimer = setTimeout(() => {
    if (!registered) ws.close(4001, "no register");
  }, 10_000);

  ws.on("message", async (data, isBinary) => {
    if (isBinary) {
      if (!conn || data.length < 4) return;
      const id = data.readUInt32BE(0);
      conn.pending.get(id)?.onChunk(data.subarray(4));
      return;
    }

    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (!registered) {
      if (msg.type !== "register" || typeof msg.token !== "string") return;
      clearTimeout(registerTimer);
      const tokenHash = sha256(msg.token);
      const agent = await prisma.storeAgent.findUnique({ where: { tokenHash } }).catch(() => null);
      if (!agent) {
        ws.send(JSON.stringify({ type: "error", code: "invalid_token" }));
        ws.close(4003, "invalid token");
        return;
      }
      registered = true;
      conn = { ws, agentId: agent.id, storeId: agent.storeId, nextReqId: 1, pending: new Map(), lastDbWrite: 0 };
      agentConns.set(agent.id, conn);

      const remoteIp = req.socket.remoteAddress || null;
      await prisma.storeAgent.update({
        where: { id: agent.id },
        data: { status: "ONLINE", lastSeenAt: new Date(), lastIp: remoteIp, agentVersion: msg.agentVersion || null },
      }).catch((e) => console.error("[agent-tunnel] не удалось обновить статус агента:", e));
      sendToRoom(agent.storeId, { type: "agent-status", agentId: agent.id, status: "ONLINE" });

      // Конфиг потоков собирается в TS-коде (расшифровка пароля + шаблоны по
      // вендору) — server.mjs идёт напрямую через node без TS-трансформации
      // (тот же принцип, что уже применён к sha256/cookie-парсингу выше),
      // поэтому запрашиваем его у самого себя через внутренний API-роут,
      // а не дублируем шифрование и парсинг вендоров плейн JS-ом здесь.
      let config = { streams: [] };
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/internal/agent-config?agentId=${agent.id}`, {
          headers: { "x-internal-secret": process.env.AUTH_SECRET || "" },
        });
        if (res.ok) config = await res.json();
      } catch (e) {
        console.error("[agent-tunnel] не удалось собрать конфиг агента:", e);
      }

      ws.send(JSON.stringify({ type: "registered", agentId: agent.id, config }));
      return;
    }

    if (!conn) return;
    switch (msg.type) {
      case "heartbeat": {
        const now = Date.now();
        if (now - conn.lastDbWrite > HEARTBEAT_DB_WRITE_MS) {
          conn.lastDbWrite = now;
          await prisma.storeAgent.update({ where: { id: conn.agentId }, data: { lastSeenAt: new Date() } }).catch(() => {});
        }
        break;
      }
      case "res-head":
        conn.pending.get(msg.id)?.onHead(msg.status, msg.headers || {});
        break;
      case "res-end":
        conn.pending.get(msg.id)?.onEnd();
        break;
      case "res-error":
        conn.pending.get(msg.id)?.onError(msg.message || "Ошибка агента");
        break;
    }
  });

  ws.on("close", async () => {
    clearTimeout(registerTimer);
    if (!conn) return;
    agentConns.delete(conn.agentId);
    for (const pending of conn.pending.values()) pending.onError?.("Агент отключился");
    await prisma.storeAgent.update({ where: { id: conn.agentId }, data: { status: "OFFLINE" } }).catch(() => {});
    sendToRoom(conn.storeId, { type: "agent-status", agentId: conn.agentId, status: "OFFLINE" });
  });
}

// Биллинг-каркас: раз при старте + затем каждые 6 часов (не раз в сутки —
// см. дизайн-план Фазы 2, решение №2: при частых редеплоях таймер сбрасывается,
// поэтому интервал короче суток, чтобы задержка не набегала на несколько дней).
// Плейн JS, а не импорт из server/services — server.mjs запускается напрямую
// через node, без TS-трансформации (тот же принцип, что уже применён к sha256/
// cookie-парсингу выше: минимальная логика дублируется, а не импортируется).
const REMINDER_WINDOW_MS = 2 * 24 * 3600_000; // напомнить за 2 дня до конца триала

async function checkBilling() {
  try {
    const now = new Date();

    // Триал закончился, статус ещё не обновлён — переводим в PAST_DUE.
    const expired = await prisma.organization.findMany({
      where: { subscriptionStatus: "TRIAL", trialEndsAt: { lt: now } },
      select: { id: true, name: true },
    });
    if (expired.length) {
      await prisma.organization.updateMany({
        where: { id: { in: expired.map((o) => o.id) } },
        data: { subscriptionStatus: "PAST_DUE", pastDueSince: now },
      });
      console.log(`[billing] триал истёк, PAST_DUE: ${expired.map((o) => o.name).join(", ")}`);
    }

    // Триал заканчивается в ближайшие 2 дня, напоминание ещё не отправляли —
    // письмо-заглушка (реальный SMTP не подключён, см. server/email/sender.ts).
    const soon = await prisma.organization.findMany({
      where: {
        subscriptionStatus: "TRIAL",
        trialEndsAt: { gte: now, lte: new Date(now.getTime() + REMINDER_WINDOW_MS) },
        trialReminderSentAt: null,
      },
      select: { id: true, name: true, trialEndsAt: true, users: { where: { role: "OWNER" }, select: { email: true }, take: 1 } },
    });
    for (const org of soon) {
      const ownerEmail = org.users[0]?.email;
      console.log(
        `\n── Письмо (заглушка, SMTP не подключён) ──\nКому: ${ownerEmail ?? "(у владельца нет email)"}\nТема: Триал скоро закончится — ТоргОС\n\nБесплатный период «${org.name}» заканчивается ${org.trialEndsAt.toLocaleDateString("ru-RU")}. Продлите, чтобы касса не остановилась.\n───────────────────────────────────────────\n`,
      );
      await prisma.organization.update({ where: { id: org.id }, data: { trialReminderSentAt: now } });
    }
  } catch (err) {
    console.error("[billing] ошибка периодической проверки:", err);
  }
}

function parseCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

async function resolveStore(req) {
  const token = parseCookie(req.headers.cookie, "torgos_session");
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { id: sha256(token) },
    include: { user: { select: { storeId: true } } },
  });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  return session.user.storeId;
}

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res, parse(req.url, true)));
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    const { pathname } = parse(req.url);

    if (pathname === "/agent-tunnel") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        handleAgentConnection(ws, req);
      });
      return;
    }

    if (pathname !== "/ws") {
      socket.destroy();
      return;
    }
    const storeId = await resolveStore(req).catch(() => null);
    if (!storeId) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      joinRoom(storeId, ws);
      ws.send(JSON.stringify({ type: "hello" }));

      // Скан с телефона (/pos/scan) → рассылается всем открытым кассам той же
      // точки, ровно как через сам WS уже рассылаются остатки. Проверяем
      // форму сообщения — это единственное место, где сервер СЛУШАЕТ клиента,
      // не только шлёт (до сих пор WS был чисто push-каналом).
      ws.on("message", (data) => {
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }
        if (msg?.type === "scan" && typeof msg.code === "string" && msg.code.length > 0 && msg.code.length <= 64) {
          sendToRoom(storeId, { type: "scan", code: msg.code });
        }
      });
    });
  });

  server.listen(port, () => {
    console.log(`ТоргОС на http://localhost:${port} (WS /ws, ${dev ? "dev" : "prod"})`);
  });

  // Раз при старте, затем каждые 6 часов — см. checkBilling выше.
  checkBilling();
  const billingTimer = setInterval(checkBilling, 6 * 3600_000);
  billingTimer.unref();

  // Плавная остановка: при SIGTERM/SIGINT (docker stop, деплой) даём серверу
  // дожать текущие запросы и транзакции, закрываем WS и коннект к БД.
  // Незавершённая продажа либо докатывается в БД, либо целиком откатывается —
  // «полупродаж» не бывает (транзакция), поэтому данные остаются целыми.
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal}: останавливаюсь аккуратно…`);
    clearInterval(billingTimer);
    for (const room of rooms.values()) for (const ws of room) ws.close(1001, "server shutdown");
    for (const conn of agentConns.values()) conn.ws.close(1001, "server shutdown");
    wss.close();
    server.close(async () => {
      await prisma.$disconnect().catch(() => {});
      console.log("Остановлен. Данные сохранены.");
      process.exit(0);
    });
    // Аварийный таймаут, если что-то зависло
    setTimeout(() => { console.error("Форсированная остановка по таймауту"); process.exit(1); }, 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
});
