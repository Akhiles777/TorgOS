// Смены. Касса работает под одним логином, а «кто на смене» выбирается
// одним тапом. Кассовый день начинается в 07:00 по МЕСТНОМУ времени точки
// (Store.timezone, IANA-зона, по умолчанию Europe/Moscow): до 07:00 продажи
// относятся к предыдущему дню (ночная доработка одной смены), после 07:00 —
// начинается новый день и касса снова спрашивает, кто заступил.
import type { TenantDb } from "../tenant";
import { prisma } from "../db";

const SHIFT_START_HOUR = 7; // граница суток — 07:00 по местному времени точки
const DEFAULT_TIMEZONE = "Europe/Moscow";

// Локальные Y-M-D-H в заданной IANA-зоне — через Intl, не через фиксированный
// offset: корректно для любой зоны (в т.ч. с DST, хотя в РФ его сейчас нет).
function localParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  // "en-CA" отдаёт год-месяц-день в порядке YYYY-MM-DD — то, что нужно для ключа
  return { y: get("year"), m: get("month"), d: get("day"), h: Number(get("hour") === "24" ? "0" : get("hour")) };
}

// Ключ кассового дня вида "2026-07-18": одинаков для всех моментов между
// 07:00 и 06:59:59 следующего дня по местному времени точки.
export function currentShiftDay(now: Date = new Date(), timezone: string = DEFAULT_TIMEZONE): string {
  const { y, m, d, h } = localParts(now, timezone);
  if (h < SHIFT_START_HOUR) {
    // До 07:00 — ещё вчерашний кассовый день. Откатываемся на календарные сутки
    // назад через Date-арифметику в UTC (сама зона тут не важна — нужен только
    // корректный «минус один день» от уже известной локальной даты).
    const prevDay = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)) - 86_400_000);
    return prevDay.toISOString().slice(0, 10);
  }
  return `${y}-${m}-${d}`;
}

async function getStoreTimezone(storeId: string): Promise<string> {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { timezone: true } });
  return store?.timezone || DEFAULT_TIMEZONE;
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
  const shiftDay = currentShiftDay(new Date(), await getStoreTimezone(storeId));
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
  const shiftDay = currentShiftDay(new Date(), await getStoreTimezone(storeId));
  await db.shift.create({ data: { storeId, employeeId, shiftDay } });
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
