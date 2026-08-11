#!/usr/bin/env node
// Агент точки — работает на мини-ПК/Raspberry Pi в магазине рядом с
// регистратором. Сам открывает исходящее WS-соединение к серверу
// (регистратор за NAT магазина, порты наружу не открываем — сервер к агенту
// подключиться не может, только агент к серверу).
//
// "Глупый" релей: не знает про Dahua/Hikvision, не хранит паролей от
// регистратора. Сервер шлёт готовый {url,method,headers} (сам собрал URL с
// учётными данными), агент делает этот HTTP-запрос и стримит ответ обратно
// кусками — тело может быть большим (архивный файл, HLS-сегмент), поэтому
// не буферизуется целиком.
//
// Allowlist адресов обязателен, не опционален: если сервер когда-то будет
// скомпрометирован, "глупый" агент без проверки адресов превращается в
// открытый пивот в сеть магазина. Разрешены только: локальный go2rtc и
// HTTP-порты регистраторов, о которых сервер явно сообщил этому агенту.
import { readFileSync, existsSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import WebSocket from "ws";
import { syncStreams } from "./go2rtcClient.mjs";

const CONFIG_PATH = process.env.TORGOS_AGENT_CONFIG || "/opt/torgos-agent/config.json";
const GO2RTC_API = process.env.GO2RTC_API || "http://127.0.0.1:1984";
const AGENT_VERSION = "1.0.0";
const RECONNECT_MS = 3000;
const HEARTBEAT_MS = 25_000;

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    console.error(`Файл конфигурации не найден: ${CONFIG_PATH}`);
    process.exit(1);
  }
  const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  if (!cfg.token || !cfg.serverUrl) {
    console.error("В конфиге нужны поля token и serverUrl");
    process.exit(1);
  }
  return cfg;
}

const { token, serverUrl } = loadConfig();

let allowedTargets = new Set([new URL(GO2RTC_API).host]);

function isAllowed(urlStr) {
  try {
    return allowedTargets.has(new URL(urlStr).host);
  } catch {
    return false;
  }
}

let ws = null;
let stopped = false;
let heartbeatTimer = null;
const pendingAborts = new Map();

function connect() {
  if (stopped) return;
  console.log(`Подключаюсь к ${serverUrl}…`);
  ws = new WebSocket(serverUrl);

  ws.on("open", () => {
    console.log("Соединение установлено, регистрируюсь…");
    sendJson({ type: "register", token, agentVersion: AGENT_VERSION });
  });

  ws.on("message", async (data, isBinary) => {
    if (isBinary) return; // агент сам бинарных фреймов не получает, только шлёт
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (msg.type === "error") {
      console.error("Сервер отклонил регистрацию:", msg.code);
      process.exitCode = 1;
      ws.close();
      return;
    }

    if (msg.type === "registered") {
      console.log(`Зарегистрирован, agentId=${msg.agentId}`);
      const streams = msg.config?.streams ?? [];
      for (const t of msg.config?.allowedTargets ?? []) allowedTargets.add(t);
      await syncStreams(GO2RTC_API, streams).catch((e) => console.error("Не удалось синхронизировать потоки go2rtc:", e.message));
      startHeartbeat();
      return;
    }

    if (msg.type === "req") {
      handleProxyRequest(msg);
      return;
    }

    if (msg.type === "req-abort") {
      pendingAborts.get(msg.id)?.abort();
      return;
    }
  });

  ws.on("close", () => {
    stopHeartbeat();
    if (stopped) return;
    console.log(`Соединение потеряно, переподключаюсь через ${RECONNECT_MS / 1000}с…`);
    setTimeout(connect, RECONNECT_MS);
  });

  ws.on("error", (e) => {
    console.error("Ошибка соединения:", e.message);
    ws.close();
  });
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) sendJson({ type: "heartbeat", ts: Date.now() });
  }, HEARTBEAT_MS);
}
function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function handleProxyRequest(msg) {
  const { id, url, method, headers, bodyBase64 } = msg;
  if (!isAllowed(url)) {
    sendJson({ type: "res-error", id, message: "URL вне allowlist — отклонено агентом" });
    return;
  }

  const controller = new AbortController();
  pendingAborts.set(id, controller);
  const client = url.startsWith("https:") ? https : http;

  const request = client.request(url, { method: method || "GET", headers: headers || {}, signal: controller.signal }, (res) => {
    sendJson({ type: "res-head", id, status: res.statusCode, headers: flattenHeaders(res.headers) });
    res.on("data", (chunk) => sendBinary(id, chunk));
    res.on("end", () => {
      sendJson({ type: "res-end", id });
      pendingAborts.delete(id);
    });
    res.on("error", (e) => {
      sendJson({ type: "res-error", id, message: e.message });
      pendingAborts.delete(id);
    });
  });
  request.on("error", (e) => {
    if (e.name !== "AbortError") sendJson({ type: "res-error", id, message: e.message });
    pendingAborts.delete(id);
  });
  if (bodyBase64) request.write(Buffer.from(bodyBase64, "base64"));
  request.end();
}

function flattenHeaders(h) {
  const out = {};
  for (const [k, v] of Object.entries(h)) out[k] = Array.isArray(v) ? v.join(", ") : String(v ?? "");
  return out;
}

function sendJson(obj) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function sendBinary(id, chunk) {
  if (ws?.readyState !== WebSocket.OPEN) return;
  const frame = Buffer.alloc(4 + chunk.length);
  frame.writeUInt32BE(id, 0);
  chunk.copy(frame, 4);
  ws.send(frame);
}

process.on("SIGTERM", () => { stopped = true; ws?.close(); process.exit(0); });
process.on("SIGINT", () => { stopped = true; ws?.close(); process.exit(0); });

connect();
