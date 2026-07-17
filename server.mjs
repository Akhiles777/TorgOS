// Custom server: Next + WebSocket в одном процессе.
// WS-соединение авторизуется cookie-сессией (storeId берётся из БД, не от клиента),
// клиенты группируются в «комнаты» по точке. Продажа на одной кассе рассылает
// новые остатки всем кассам той же точки.
import { createServer } from "node:http";
import { parse } from "node:url";
import { createHash } from "node:crypto";
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

function broadcast(storeId, updates, saleNumber) {
  const room = rooms.get(storeId);
  if (!room) return;
  const payload = JSON.stringify({ type: "stock", storeId, updates, saleNumber });
  for (const ws of room) if (ws.readyState === ws.OPEN) ws.send(payload);
}

// Мост к API-роутам Next: тот же процесс, общий globalThis.
globalThis.__torgosBroadcast = broadcast;

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
    });
  });

  server.listen(port, () => {
    console.log(`ТоргОС на http://localhost:${port} (WS /ws, ${dev ? "dev" : "prod"})`);
  });
});
