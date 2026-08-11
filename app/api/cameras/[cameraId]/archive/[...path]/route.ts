import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { requireApi, AuthError } from "@/server/guard";
import { getCameraWithAccess, CameraAccessDeniedError } from "@/server/services/cameras";
import { decryptSecret } from "@/server/cameraCrypto";
import { CAMERA_VENDORS } from "@/lib/cameraVendors";
import { proxyToAgent, AgentOfflineError, AgentTimeoutError } from "@/server/agentTunnel";

// Плейбек архива по диапазону времени (?from=&to=, ISO) и скачивание фрагмента
// (?download=1) — в отличие от live-потока (app/api/cameras/[cameraId]/stream/)
// источник для go2rtc здесь не заранее зарегистрированное имя потока, а RTSP
// URL плейбека, собранный на лету под конкретный диапазон (см. lib/cameraVendors.ts).
// Список записанных файлов (где именно есть архив на шкале) НЕ реализован —
// см. отчёт по фиче: CGI-поиск файлов у Dahua/Hikvision не проверен на
// реальном устройстве, деградируем в разрешённый бридом режим «вся шкала,
// плейбек с любой точки без предварительной разметки».
export const dynamic = "force-dynamic";

const ALLOWED_PATHS = new Set(["stream.mp4", "stream.m3u8"]);

export async function GET(req: Request, ctx: { params: Promise<{ cameraId: string; path: string[] }> }) {
  const { cameraId, path } = await ctx.params;
  const subPath = path.join("/");
  if (!ALLOWED_PATHS.has(subPath)) return NextResponse.json({ error: "Недопустимый путь" }, { status: 400 });

  const url = new URL(req.url);
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");
  if (!fromStr || !toStr) return NextResponse.json({ error: "Нужны параметры from и to" }, { status: 400 });
  const from = new Date(fromStr);
  const to = new Date(toStr);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    return NextResponse.json({ error: "Некорректный диапазон времени" }, { status: 400 });
  }

  let db, user;
  try {
    ({ db, user } = await requireApi("OWNER", "ADMIN"));
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  let camera;
  try {
    camera = await getCameraWithAccess(db, cameraId, user);
    if (!camera) return NextResponse.json({ error: "Камера не найдена" }, { status: 404 });
  } catch (e) {
    if (e instanceof CameraAccessDeniedError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const device = camera.device;
  const password = decryptSecret(device.passwordEnc);
  const vendor = CAMERA_VENDORS[device.vendor];
  const vendorCtx = { host: device.host, rtspPort: device.rtspPort, httpPort: device.httpPort, username: device.username, password, channel: camera.channel };

  let playbackUrl: string;
  try {
    playbackUrl = vendor.playbackRtspUrl(vendorCtx, from, to);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Плейбек недоступен для этого вендора" }, { status: 400 });
  }

  const go2rtcBase = device.connection === "DIRECT" ? process.env.GO2RTC_DIRECT_URL : "http://127.0.0.1:1984";
  if (!go2rtcBase) return NextResponse.json({ error: "go2rtc недоступен" }, { status: 503 });
  const targetUrl = `${go2rtcBase}/api/${subPath}?src=${encodeURIComponent(playbackUrl)}`;

  const extraHeaders: Record<string, string> = {};
  if (url.searchParams.get("download") === "1") {
    // Заголовок HTTP обязан быть ByteString (Latin1) — «Касса» и т.п. ломает
    // fetch/Response с TypeError. ASCII-заглушка в filename= для старых
    // клиентов + правильное имя в filename*= (RFC 5987) для всех современных.
    const asciiFallback = camera.name.replace(/[^\x20-\x7E]+/g, "_") || "camera";
    const encoded = encodeURIComponent(`${camera.name}_${fromStr}.mp4`);
    extraHeaders["content-disposition"] = `attachment; filename="${asciiFallback}_${fromStr}.mp4"; filename*=UTF-8''${encoded}`;
  }

  try {
    if (device.connection === "DIRECT") {
      const res = await fetch(targetUrl, { signal: AbortSignal.timeout(30_000) });
      return new Response(res.body, {
        status: res.status,
        headers: { "content-type": res.headers.get("content-type") ?? "video/mp4", ...extraHeaders },
      });
    }
    if (!device.agentId) return NextResponse.json({ error: "У устройства не указан агент" }, { status: 503 });
    const res = await proxyToAgent(device.agentId, { url: targetUrl, method: "GET", timeoutMs: 30_000 });
    const webStream = Readable.toWeb(res.body) as ReadableStream<Uint8Array>;
    return new Response(webStream, {
      status: res.status,
      headers: { "content-type": res.headers["content-type"] ?? "video/mp4", ...extraHeaders },
    });
  } catch (e) {
    if (e instanceof AgentOfflineError) return NextResponse.json({ error: e.message }, { status: 503 });
    if (e instanceof AgentTimeoutError) return NextResponse.json({ error: e.message }, { status: 504 });
    console.error("[camera-archive] сбой проксирования:", e);
    return NextResponse.json({ error: "Не удалось получить архив" }, { status: 502 });
  }
}
