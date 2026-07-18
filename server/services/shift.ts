// Смены. Касса работает под одним логином, а «кто на смене» выбирается
// одним тапом. Кассовый день начинается в 07:00 МСК: до 07:00 продажи
// относятся к предыдущему дню (ночная доработка одной смены), после 07:00 —
// начинается новый день и касса снова спрашивает, кто заступил.
import type { TenantDb } from "../tenant";

const MSK_OFFSET_MS = 3 * 3600_000; // МСК = UTC+3
const SHIFT_START_HOUR = 7; // граница суток — 07:00 МСК

// Ключ кассового дня вида "2026-07-18": одинаков для всех моментов между
// 07:00 МСК и 06:59:59 МСК следующего дня.
export function currentShiftDay(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + MSK_OFFSET_MS - SHIFT_START_HOUR * 3600_000);
  return shifted.toISOString().slice(0, 10);
}

export type ShiftEmployee = { id: string; name: string };
export type CurrentShift = { employee: ShiftEmployee; shiftDay: string } | null;

export async function listEmployees(db: TenantDb, storeId: string): Promise<ShiftEmployee[]> {
  const rows = await db.employee.findMany({
    where: { storeId, active: true },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  return rows;
}

// Кто сейчас на смене (последний выбор за текущий кассовый день) или null.
export async function getCurrentShift(db: TenantDb, storeId: string): Promise<CurrentShift> {
  const shiftDay = currentShiftDay();
  const shift = await db.shift.findFirst({
    where: { storeId, shiftDay },
    orderBy: { createdAt: "desc" },
    select: { employee: { select: { id: true, name: true } } },
  });
  if (!shift) return null;
  return { employee: shift.employee, shiftDay };
}

export class ShiftError extends Error {}

// Отметить, кто заступил на смену. Возвращает выбранного сотрудника.
export async function startShift(db: TenantDb, storeId: string, employeeId: string): Promise<ShiftEmployee> {
  const employee = await db.employee.findFirst({ where: { id: employeeId, storeId, active: true }, select: { id: true, name: true } });
  if (!employee) throw new ShiftError("Сотрудник не найден");
  await db.shift.create({ data: { storeId, employeeId, shiftDay: currentShiftDay() } });
  return employee;
}

export async function createEmployee(db: TenantDb, storeId: string, name: string): Promise<ShiftEmployee> {
  const clean = name.trim();
  if (clean.length < 2) throw new ShiftError("Укажите имя сотрудника");
  const emp = await db.employee.create({ data: { storeId, name: clean }, select: { id: true, name: true } });
  return emp;
}

export async function deactivateEmployee(db: TenantDb, id: string): Promise<void> {
  // Не удаляем — прячем: у сотрудника есть история продаж, её нельзя терять.
  await db.employee.update({ where: { id }, data: { active: false } });
}
