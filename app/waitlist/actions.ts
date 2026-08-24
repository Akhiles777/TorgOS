"use server";

import { headers } from "next/headers";
import { prisma } from "@/server/db";

type LeadResult = { ok: true } | { ok: false; error: string };
const attempts = new Map<string, number[]>();

export async function submitLeadAction(_prev: unknown, formData: FormData): Promise<LeadResult> {
  if (String(formData.get("website") ?? "").trim()) return { ok: true };
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "unknown";
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter((time) => now - time < 3_600_000);
  if (recent.length >= 3) return { ok: false, error: "Заявки с этого адреса временно ограничены. Попробуйте позже." };
  recent.push(now);
  attempts.set(ip, recent);

  const value = (key: string) => String(formData.get(key) ?? "").trim();
  const name = value("name");
  const contact = value("contact");
  const contactType = value("contactType");
  const venueType = value("venueType");
  const city = value("city");
  const pointsCount = value("pointsCount");
  const currentSystem = value("currentSystem");
  if (!name || name.length > 100) return { ok: false, error: "Укажите имя." };
  if (!contact || contact.length > 120 || !["phone", "telegram"].includes(contactType)) return { ok: false, error: "Оставьте телефон или Telegram." };
  if (!venueType || !city || !pointsCount || !currentSystem) return { ok: false, error: "Заполните основные поля заявки." };

  await prisma.lead.create({
    data: {
      name, contact, contactType, venueType, city, pointsCount, currentSystem,
      painPoint: value("painPoint") || null,
      readyToCall: formData.get("readyToCall") === "on",
      source: value("source") || requestHeaders.get("referer") || null,
    },
  });
  return { ok: true };
}