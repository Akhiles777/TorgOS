// Камеры: устройства/каналы/агенты точки. Пароли регистраторов шифруются
// здесь и только здесь (server/cameraCrypto.ts) — наружу (в API-ответы,
// логи) расшифрованный пароль никогда не отдаётся.
import { randomBytes, createHash } from "node:crypto";
import type { TenantDb } from "../tenant";
import type { CameraVendor, CameraConnectionMode } from "@prisma/client";
import { encryptSecret, decryptSecret } from "../cameraCrypto";
import { CAMERA_VENDORS, type UrlOverride, type VendorUrlContext } from "@/lib/cameraVendors";
import { proxyToAgent, isAgentOnline } from "../agentTunnel";

export class CameraError extends Error {}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// Общая проверка доступа для API-роутов, отдающих поток/архив — переиспользуется
// в live- и archive-прокси, чтобы не дублировать одну и ту же проверку дважды.
// OWNER видит камеры всех своих точек (tenantDb уже отсекает чужие организации),
// ADMIN — только свою точку.
export class CameraAccessDeniedError extends CameraError {}

// null = камеры с таким id нет (404 для вызывающего кода); бросает
// CameraAccessDeniedError = камера есть, но не в точке этого ADMIN (403) —
// разные исходы нарочно различимы по типу, не по тексту сообщения.
export async function getCameraWithAccess(db: TenantDb, cameraId: string, user: { role: string; storeId: string | null }) {
  const camera = await db.camera.findFirst({ where: { id: cameraId }, include: { device: true } });
  if (!camera) return null;
  if (user.role === "ADMIN" && camera.device.storeId !== user.storeId) throw new CameraAccessDeniedError("Нет доступа к этой камере");
  return camera;
}

// ── Агенты ────────────────────────────────────────────────────────────────
export type AgentRow = {
  id: string;
  name: string;
  status: "PENDING" | "ONLINE" | "OFFLINE";
  lastSeenAt: string | null;
  agentVersion: string | null;
  deviceCount: number;
};

export async function listAgents(db: TenantDb, storeId: string): Promise<AgentRow[]> {
  const rows = await db.storeAgent.findMany({
    where: { storeId },
    include: { _count: { select: { devices: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((a) => ({
    id: a.id, name: a.name, status: a.status,
    lastSeenAt: a.lastSeenAt ? a.lastSeenAt.toISOString() : null,
    agentVersion: a.agentVersion, deviceCount: a._count.devices,
  }));
}

// Токен показывается вызывающему коду РОВНО один раз (для install-команды) —
// в БД остаётся только хеш, та же схема, что Session/SuperAdminSession.
export async function createAgent(db: TenantDb, storeId: string, name: string): Promise<{ id: string; token: string }> {
  if (!name.trim()) throw new CameraError("Укажите название агента");
  const token = randomBytes(24).toString("base64url");
  const created = await db.storeAgent.create({ data: { storeId, name: name.trim(), tokenHash: sha256(token) } });
  return { id: created.id, token };
}

export async function deleteAgent(db: TenantDb, id: string): Promise<void> {
  const inUse = await db.cameraDevice.count({ where: { agentId: id } });
  if (inUse > 0) throw new CameraError("За агентом закреплены устройства — сначала отвяжите или удалите их");
  await db.storeAgent.delete({ where: { id } });
}

// ── Устройства ────────────────────────────────────────────────────────────
export type CameraRow = { id: string; deviceId: string; channel: number; name: string; enabled: boolean; sortOrder: number };

export type DeviceRow = {
  id: string;
  name: string;
  vendor: CameraVendor;
  connection: CameraConnectionMode;
  agentId: string | null;
  agentName: string | null;
  agentStatus: "PENDING" | "ONLINE" | "OFFLINE" | null;
  host: string;
  rtspPort: number;
  httpPort: number;
  username: string;
  channelCount: number;
  clockOffsetSec: number | null;
  clockCheckedAt: string | null;
  cameras: CameraRow[];
};

function toDeviceRow(d: {
  id: string; name: string; vendor: CameraVendor; connection: CameraConnectionMode; agentId: string | null;
  agent: { name: string; status: "PENDING" | "ONLINE" | "OFFLINE" } | null;
  host: string; rtspPort: number; httpPort: number; username: string; channelCount: number;
  clockOffsetSec: number | null; clockCheckedAt: Date | null;
  cameras: { id: string; deviceId: string; channel: number; name: string; enabled: boolean; sortOrder: number }[];
}): DeviceRow {
  return {
    id: d.id, name: d.name, vendor: d.vendor, connection: d.connection, agentId: d.agentId,
    agentName: d.agent?.name ?? null, agentStatus: d.agent?.status ?? null,
    host: d.host, rtspPort: d.rtspPort, httpPort: d.httpPort, username: d.username, channelCount: d.channelCount,
    clockOffsetSec: d.clockOffsetSec, clockCheckedAt: d.clockCheckedAt ? d.clockCheckedAt.toISOString() : null,
    cameras: d.cameras.map((c) => ({ id: c.id, deviceId: c.deviceId, channel: c.channel, name: c.name, enabled: c.enabled, sortOrder: c.sortOrder })),
  };
}

export async function listDevices(db: TenantDb, storeId: string): Promise<DeviceRow[]> {
  const rows = await db.cameraDevice.findMany({
    where: { storeId },
    include: { agent: { select: { name: true, status: true } }, cameras: { orderBy: { sortOrder: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toDeviceRow);
}

export type DeviceInput = {
  name: string;
  vendor: CameraVendor;
  connection: CameraConnectionMode;
  agentId?: string | null;
  host: string;
  rtspPort?: number;
  httpPort?: number;
  username: string;
  // Необязателен на обновлении — если не передан, старый пароль не трогаем.
  password?: string;
  channelCount?: number;
  urlOverride?: UrlOverride | null;
};

function validateDeviceInput(input: DeviceInput) {
  if (!input.name.trim()) throw new CameraError("Укажите название устройства");
  if (!input.host.trim()) throw new CameraError("Укажите адрес регистратора в локальной сети");
  if (!input.username.trim()) throw new CameraError("Укажите логин регистратора");
  if (input.connection === "AGENT" && !input.agentId) throw new CameraError("Для подключения через агента выберите агента");
  if (input.connection === "DIRECT" && input.agentId) throw new CameraError("У прямого подключения не может быть агента");
}

export async function createDevice(db: TenantDb, storeId: string, input: DeviceInput): Promise<string> {
  validateDeviceInput(input);
  if (!input.password) throw new CameraError("Укажите пароль регистратора");
  const created = await db.cameraDevice.create({
    data: {
      storeId, name: input.name.trim(), vendor: input.vendor, connection: input.connection,
      agentId: input.connection === "AGENT" ? input.agentId : null,
      host: input.host.trim(), rtspPort: input.rtspPort ?? 554, httpPort: input.httpPort ?? 80,
      username: input.username.trim(), passwordEnc: encryptSecret(input.password),
      channelCount: input.channelCount ?? 1, urlOverride: input.urlOverride ?? undefined,
    },
  });
  return created.id;
}

export async function updateDevice(db: TenantDb, id: string, input: DeviceInput): Promise<void> {
  validateDeviceInput(input);
  await db.cameraDevice.update({
    where: { id },
    data: {
      name: input.name.trim(), vendor: input.vendor, connection: input.connection,
      agentId: input.connection === "AGENT" ? input.agentId : null,
      host: input.host.trim(), rtspPort: input.rtspPort ?? 554, httpPort: input.httpPort ?? 80,
      username: input.username.trim(),
      ...(input.password ? { passwordEnc: encryptSecret(input.password) } : {}),
      channelCount: input.channelCount ?? 1, urlOverride: input.urlOverride ?? undefined,
    },
  });
}

export async function deleteDevice(db: TenantDb, id: string): Promise<void> {
  await db.cameraDevice.delete({ where: { id } });
}

// ── Каналы ────────────────────────────────────────────────────────────────
export async function createCamera(db: TenantDb, deviceId: string, input: { channel: number; name: string }): Promise<string> {
  if (!input.name.trim()) throw new CameraError("Укажите название камеры");
  if (input.channel < 1) throw new CameraError("Номер канала должен быть не меньше 1");
  const dup = await db.camera.findFirst({ where: { deviceId, channel: input.channel } });
  if (dup) throw new CameraError("Такой канал уже добавлен для этого устройства");
  const maxOrder = await db.camera.aggregate({ where: { deviceId }, _max: { sortOrder: true } });
  const created = await db.camera.create({
    data: { deviceId, channel: input.channel, name: input.name.trim(), sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
  });
  return created.id;
}

export async function updateCamera(db: TenantDb, id: string, input: Partial<{ name: string; enabled: boolean; sortOrder: number }>): Promise<void> {
  await db.camera.update({
    where: { id },
    data: { ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.enabled !== undefined ? { enabled: input.enabled } : {}), ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}) },
  });
}

export async function deleteCamera(db: TenantDb, id: string): Promise<void> {
  await db.camera.delete({ where: { id } });
}

// ── Проверка подключения + часов ────────────────────────────────────────
async function fetchThroughDevice(
  device: { connection: CameraConnectionMode; agentId: string | null },
  url: string,
): Promise<{ status: number; body: string }> {
  if (device.connection === "DIRECT") {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return { status: res.status, body: await res.text() };
  }
  if (!device.agentId) throw new CameraError("У устройства не указан агент");
  if (!isAgentOnline(device.agentId)) throw new CameraError("Агент офлайн — подключитесь к нему сначала");
  const res = await proxyToAgent(device.agentId, { url, method: "GET", timeoutMs: 8000 });
  const chunks: Buffer[] = [];
  for await (const chunk of res.body) chunks.push(chunk as Buffer);
  return { status: res.status, body: Buffer.concat(chunks).toString("utf8") };
}

export type TestConnectionResult = { ok: boolean; error?: string; warning?: string; clockOffsetSec?: number };

export async function testDeviceConnection(db: TenantDb, deviceId: string): Promise<TestConnectionResult> {
  const device = await db.cameraDevice.findFirst({ where: { id: deviceId } });
  if (!device) throw new CameraError("Устройство не найдено");

  const password = decryptSecret(device.passwordEnc);
  const ctx: VendorUrlContext = {
    host: device.host, rtspPort: device.rtspPort, httpPort: device.httpPort, username: device.username, password, channel: 1,
  };
  const vendor = CAMERA_VENDORS[device.vendor];

  let check: ReturnType<typeof vendor.clockCheck>;
  try {
    check = vendor.clockCheck(ctx);
  } catch {
    return { ok: false, error: "Для этого вендора проверка часов недоступна без ручных URL (см. настройки устройства)" };
  }

  try {
    const { status, body } = await fetchThroughDevice(device, check.url);
    if (status < 200 || status >= 300) {
      await db.cameraDevice.update({ where: { id: deviceId }, data: { clockCheckedAt: new Date() } });
      return { ok: false, error: `Регистратор ответил статусом ${status}` };
    }
    const deviceTime = check.parseTime(body, {});
    if (!deviceTime) {
      await db.cameraDevice.update({ where: { id: deviceId }, data: { clockCheckedAt: new Date() } });
      return { ok: true, warning: "Подключение есть, но не удалось разобрать время устройства — формат ответа мог отличаться на этой прошивке" };
    }
    const offsetSec = Math.round((deviceTime.getTime() - Date.now()) / 1000);
    await db.cameraDevice.update({ where: { id: deviceId }, data: { clockOffsetSec: offsetSec, clockCheckedAt: new Date() } });
    return { ok: true, clockOffsetSec: offsetSec };
  } catch (e) {
    return { ok: false, error: e instanceof CameraError ? e.message : e instanceof Error ? e.message : "Не удалось подключиться" };
  }
}

// ── Куда слать запрос на поток ──────────────────────────────────────────
export type StreamTarget =
  | { kind: "agent"; agentId: string; go2rtcBase: string }
  | { kind: "direct"; go2rtcBase: string };

export type StreamLookup = { target: StreamTarget; streamName: string; streamNameSub: string };

export async function getStreamTarget(db: TenantDb, cameraId: string): Promise<StreamLookup | null> {
  const camera = await db.camera.findFirst({ where: { id: cameraId }, include: { device: true } });
  if (!camera || !camera.enabled) return null;
  const streamName = `cam_${camera.id}`;
  const streamNameSub = `cam_${camera.id}_sub`;

  if (camera.device.connection === "DIRECT") {
    const base = process.env.GO2RTC_DIRECT_URL;
    if (!base) return null;
    return { target: { kind: "direct", go2rtcBase: base }, streamName, streamNameSub };
  }
  if (!camera.device.agentId) return null;
  return { target: { kind: "agent", agentId: camera.device.agentId, go2rtcBase: "http://127.0.0.1:1984" }, streamName, streamNameSub };
}

// Синхронизация потоков в НАШ go2rtc для connection=DIRECT (агента нет —
// сами тянем RTSP напрямую с публично доступного регистратора). Для AGENT-
// режима синхронизацию делает сам агент при регистрации (см. app/api/internal/agent-config).
export async function syncDirectStreams(db: TenantDb, deviceId: string): Promise<void> {
  const base = process.env.GO2RTC_DIRECT_URL;
  if (!base) return;
  const device = await db.cameraDevice.findFirst({ where: { id: deviceId }, include: { cameras: { where: { enabled: true } } } });
  if (!device || device.connection !== "DIRECT") return;

  const password = decryptSecret(device.passwordEnc);
  const vendor = CAMERA_VENDORS[device.vendor];
  const override = (device.urlOverride as UrlOverride | null) ?? {};

  for (const camera of device.cameras) {
    const ctx: VendorUrlContext = { host: device.host, rtspPort: device.rtspPort, httpPort: device.httpPort, username: device.username, password, channel: camera.channel };
    try {
      const rtspUrl = override.rtspUrl || vendor.rtspUrl(ctx);
      const rtspUrlSub = override.rtspUrlSub || vendor.rtspUrlSub(ctx);
      await fetch(`${base}/api/streams?name=cam_${camera.id}&src=${encodeURIComponent(rtspUrl)}`, { method: "PUT" }).catch(() => {});
      await fetch(`${base}/api/streams?name=cam_${camera.id}_sub&src=${encodeURIComponent(rtspUrlSub)}`, { method: "PUT" }).catch(() => {});
    } catch (e) {
      console.error(`[cameras] не удалось синхронизировать прямой поток камеры ${camera.id}:`, e);
    }
  }
}
