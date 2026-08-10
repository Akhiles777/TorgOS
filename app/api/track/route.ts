import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import type { SiteEventType } from "@prisma/client";

// Единственный в проекте намеренно неавторизованный write-путь — сигналы шлют
// анонимные посетители лендинга без сессии. См. отчёт по фиче: rate-limit тут
// не защита от денег/данных, а просто фильтр от спама одному Node-процессу.
export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set<SiteEventType>(["PAGEVIEW", "SCROLL_25", "SCROLL_50", "SCROLL_75", "SCROLL_100", "CTA_CLICK"]);
const ALLOWED_DEVICES = new Set(["mobile", "tablet", "desktop"]);
const ALLOWED_CTA = new Set(["header", "hero", "pricing", "final"]);
const SESSION_ID_RE = /^[a-zA-Z0-9-]{8,64}$/;

// In-memory, module-scope — переживает между запросами только потому, что
// server.mjs держит один постоянный Node-процесс (не serverless). При
// переезде на serverless/несколько инстансов лимитер надо будет заменить.
const WINDOW_MS = 60_000;
const LIMIT_PER_WINDOW = 60;
const buckets = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  // Ленивая чистка вместо отдельного таймера — не хотим ещё один setInterval
  // ради MVP-лимитера с ожидаемо небольшим трафиком.
  if (buckets.size > 5000) {
    for (const [key, b] of buckets) {
      if (b.resetAt < now) buckets.delete(key);
    }
  }
  const b = buckets.get(ip);
  if (!b || b.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  b.count += 1;
  return b.count > LIMIT_PER_WINDOW;
}

function clip(s: unknown, maxLen: number): string | null {
  if (typeof s !== "string") return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const type = body.type as SiteEventType;
  if (!ALLOWED_TYPES.has(type)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" && SESSION_ID_RE.test(body.sessionId) ? body.sessionId : null;
  if (!sessionId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const path = clip(body.path, 200);
  if (!path || !path.startsWith("/")) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const referrer = clip(body.referrer, 100);
  const utmSource = clip(body.utmSource, 60);
  const deviceRaw = clip(body.device, 20);
  const device = deviceRaw && ALLOWED_DEVICES.has(deviceRaw) ? deviceRaw : null;
  const ctaRaw = type === "CTA_CLICK" ? clip(body.cta, 20) : null;
  const cta = ctaRaw && ALLOWED_CTA.has(ctaRaw) ? ctaRaw : null;

  // Не await — ответ уходит сразу, запись идёт фоном в том же процессе.
  // .catch тут обязателен: необработанный reject в фоне уронит процесс.
  prisma.siteEvent
    .create({ data: { type, sessionId, path, referrer, utmSource, device, cta } })
    .catch((err) => console.error("[track] write failed", err));

  return NextResponse.json({ ok: true }, { status: 202 });
}
