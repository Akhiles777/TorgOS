"use server";
import { revalidatePath } from "next/cache";
import { requireApi, AuthError } from "@/server/guard";
import {
  createAgent, deleteAgent, createDevice, updateDevice, deleteDevice,
  createCamera, updateCamera, deleteCamera, testDeviceConnection,
  CameraError, type DeviceInput, type TestConnectionResult,
} from "@/server/services/cameras";
import { askCameraSetupAssistant, CameraChatError } from "@/server/ai/cameraSetupChat";
import type { CameraVendor } from "@prisma/client";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// OWNER видит камеры всех своих точек (см. app/admin/cameras/page.tsx) —
// requireApiStoreScope здесь не подходит, он жёстко резолвит одну точку.
// Клиент всегда явно передаёт storeId (знает его из уже загруженной страницы),
// действие проверяет, что этот storeId принадлежит вызывающему.
async function requireStoreAccess(storeId: string) {
  const { db, user } = await requireApi("OWNER", "ADMIN");
  if (user.role === "ADMIN" && user.storeId !== storeId) throw new AuthError(403, "Нет доступа к этой точке");
  const store = await db.store.findFirst({ where: { id: storeId } }); // tenantDb уже отсекает чужую организацию
  if (!store) throw new AuthError(404, "Точка не найдена");
  return { db, user };
}

function fail(e: unknown, fallback: string): { ok: false; error: string } {
  if (e instanceof CameraError || e instanceof AuthError) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: fallback };
}

// ── Агенты ────────────────────────────────────────────────────────────────
export async function createAgentAction(storeId: string, name: string): Promise<Result<{ id: string; token: string }>> {
  try {
    const { db } = await requireStoreAccess(storeId);
    const created = await createAgent(db, storeId, name);
    revalidatePath("/admin/cameras/settings");
    return { ok: true, ...created };
  } catch (e) {
    return fail(e, "Не удалось создать агента");
  }
}

export async function deleteAgentAction(storeId: string, agentId: string): Promise<Result> {
  try {
    const { db } = await requireStoreAccess(storeId);
    await deleteAgent(db, agentId);
    revalidatePath("/admin/cameras/settings");
    return { ok: true };
  } catch (e) {
    return fail(e, "Не удалось удалить агента");
  }
}

// ── Устройства ────────────────────────────────────────────────────────────
export type DeviceFormInput = Omit<DeviceInput, "vendor" | "connection"> & { vendor: CameraVendor; connection: "AGENT" | "DIRECT" };

export async function createDeviceAction(storeId: string, input: DeviceFormInput): Promise<Result<{ id: string }>> {
  try {
    const { db } = await requireStoreAccess(storeId);
    const id = await createDevice(db, storeId, input);
    revalidatePath("/admin/cameras/settings");
    return { ok: true, id };
  } catch (e) {
    return fail(e, "Не удалось добавить устройство");
  }
}

export async function updateDeviceAction(storeId: string, deviceId: string, input: DeviceFormInput): Promise<Result> {
  try {
    const { db } = await requireStoreAccess(storeId);
    await updateDevice(db, deviceId, input);
    revalidatePath("/admin/cameras/settings");
    return { ok: true };
  } catch (e) {
    return fail(e, "Не удалось сохранить устройство");
  }
}

export async function deleteDeviceAction(storeId: string, deviceId: string): Promise<Result> {
  try {
    const { db } = await requireStoreAccess(storeId);
    await deleteDevice(db, deviceId);
    revalidatePath("/admin/cameras/settings");
    revalidatePath("/admin/cameras");
    return { ok: true };
  } catch (e) {
    return fail(e, "Не удалось удалить устройство");
  }
}

// TestConnectionResult уже само содержит ok/error — не оборачиваем в общий
// Result<T> (там был бы конфликт двух полей "ok").
export async function testConnectionAction(storeId: string, deviceId: string): Promise<TestConnectionResult> {
  try {
    const { db } = await requireStoreAccess(storeId);
    const result = await testDeviceConnection(db, deviceId);
    revalidatePath("/admin/cameras/settings");
    return result;
  } catch (e) {
    if (e instanceof CameraError || e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось проверить подключение" };
  }
}

// ── Каналы ────────────────────────────────────────────────────────────────
export async function createCameraAction(storeId: string, deviceId: string, input: { channel: number; name: string }): Promise<Result<{ id: string }>> {
  try {
    const { db } = await requireStoreAccess(storeId);
    const id = await createCamera(db, deviceId, input);
    revalidatePath("/admin/cameras/settings");
    revalidatePath("/admin/cameras");
    return { ok: true, id };
  } catch (e) {
    return fail(e, "Не удалось добавить камеру");
  }
}

export async function updateCameraAction(storeId: string, cameraId: string, input: Partial<{ name: string; enabled: boolean; sortOrder: number }>): Promise<Result> {
  try {
    const { db } = await requireStoreAccess(storeId);
    await updateCamera(db, cameraId, input);
    revalidatePath("/admin/cameras/settings");
    revalidatePath("/admin/cameras");
    return { ok: true };
  } catch (e) {
    return fail(e, "Не удалось сохранить камеру");
  }
}

export async function deleteCameraAction(storeId: string, cameraId: string): Promise<Result> {
  try {
    const { db } = await requireStoreAccess(storeId);
    await deleteCamera(db, cameraId);
    revalidatePath("/admin/cameras/settings");
    revalidatePath("/admin/cameras");
    return { ok: true };
  } catch (e) {
    return fail(e, "Не удалось удалить камеру");
  }
}

// ── ИИ-помощник по подключению ──────────────────────────────────────────
export async function askCameraSetupAction(question: string, deviceContext?: { vendor: CameraVendor; host: string }): Promise<Result<{ answer: string }>> {
  try {
    await requireApi("OWNER", "ADMIN");
    const answer = await askCameraSetupAssistant(question, deviceContext);
    return { ok: true, answer };
  } catch (e) {
    if (e instanceof CameraChatError || e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось получить ответ" };
  }
}
