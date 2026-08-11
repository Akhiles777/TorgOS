import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { requireApi, AuthError } from "@/server/guard";
import { getStreamTarget, getCameraWithAccess, CameraAccessDeniedError } from "@/server/services/cameras";
import { proxyToAgent, AgentOfflineError, AgentTimeoutError } from "@/server/agentTunnel";

// Проксирует сигналинг/поток go2rtc (WebRTC-сигналинг, HLS-плейлист/сегменты)
// до нужного go2rtc — своего (connection=DIRECT) или агентского через туннель
// (connection=AGENT). Проверка прав — на КАЖДЫЙ запрос, не токен на N минут:
// сегментов HLS может быть десятки в минуту, а кассир/чужой ADMIN не должен
// достучаться до потока даже подобрав URL (см. отчёт по фиче).
export const dynamic = "force-dynamic";

// Явный allowlist go2rtc-путей, которые вообще можно проксировать через этот
// роут — не пропускаем сюда административные пути go2rtc (напр. /api/streams).
const ALLOWED_PATHS = new Set(["webrtc", "ws", "stream.m3u8", "stream.mp4"]);

async function handle(req: Request, params: Promise<{ cameraId: string; path: string[] }>): Promise<Response> {
  const { cameraId, path } = await params;
  const subPath = path.join("/");
  if (!ALLOWED_PATHS.has(subPath)) return NextResponse.json({ error: "Недопустимый путь" }, { status: 400 });

  let db, user;
  try {
    ({ db, user } = await requireApi("OWNER", "ADMIN"));
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  try {
    const camera = await getCameraWithAccess(db, cameraId, user);
    if (!camera) return NextResponse.json({ error: "Камера не найдена" }, { status: 404 });
  } catch (e) {
    if (e instanceof CameraAccessDeniedError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const lookup = await getStreamTarget(db, cameraId);
  if (!lookup) return NextResponse.json({ error: "Поток недоступен" }, { status: 503 });

  const quality = new URL(req.url).searchParams.get("quality") === "main" ? lookup.streamName : lookup.streamNameSub;
  const targetUrl = `${lookup.target.go2rtcBase}/api/${subPath}?src=${encodeURIComponent(quality)}`;

  const method = req.method;
  const body = method !== "GET" && method !== "HEAD" ? Buffer.from(await req.arrayBuffer()) : undefined;
  const headers: Record<string, string> = {};
  const contentType = req.headers.get("content-type");
  if (contentType) headers["content-type"] = contentType;

  try {
    if (lookup.target.kind === "direct") {
      const res = await fetch(targetUrl, { method, headers, body, signal: AbortSignal.timeout(15_000) });
      return new Response(res.body, {
        status: res.status,
        headers: { "content-type": res.headers.get("content-type") ?? "application/octet-stream" },
      });
    }
    const res = await proxyToAgent(lookup.target.agentId, { url: targetUrl, method, headers, body, timeoutMs: 15_000 });
    const webStream = Readable.toWeb(res.body) as ReadableStream<Uint8Array>;
    return new Response(webStream, {
      status: res.status,
      headers: { "content-type": res.headers["content-type"] ?? "application/octet-stream" },
    });
  } catch (e) {
    if (e instanceof AgentOfflineError) return NextResponse.json({ error: e.message }, { status: 503 });
    if (e instanceof AgentTimeoutError) return NextResponse.json({ error: e.message }, { status: 504 });
    console.error("[camera-stream] сбой проксирования:", e);
    return NextResponse.json({ error: "Не удалось получить поток" }, { status: 502 });
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ cameraId: string; path: string[] }> }) {
  return handle(req, ctx.params);
}
export async function POST(req: Request, ctx: { params: Promise<{ cameraId: string; path: string[] }> }) {
  return handle(req, ctx.params);
}
