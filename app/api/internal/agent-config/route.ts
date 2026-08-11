import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { decryptSecret } from "@/server/cameraCrypto";
import { CAMERA_VENDORS, type UrlOverride } from "@/lib/cameraVendors";

// Внутренний роут — вызывается ТОЛЬКО из server.mjs (тот же процесс, localhost),
// когда агент регистрируется по туннелю и ему нужен список RTSP-потоков.
// Расшифровка пароля и вендорные шаблоны URL живут в TS (server.mjs идёт
// напрямую через node, без TS-трансформации) — поэтому конфиг собирается
// здесь, а не дублируется плейн JS-ом в server.mjs.
//
// Сырой prisma, не tenantDb: у server.mjs на этом этапе нет пользовательской
// сессии — agentId уже прошёл проверку по tokenHash до этого вызова, сам факт
// его передачи сюда и есть доказательство принадлежности (агент физически не
// может получить чужой agentId, не пройдя регистрацию по своему токену).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = req.headers.get("x-internal-secret");
  if (!secret || secret !== process.env.AUTH_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const agentId = new URL(req.url).searchParams.get("agentId");
  if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 });

  const devices = await prisma.cameraDevice.findMany({
    where: { agentId, connection: "AGENT" },
    include: { cameras: { where: { enabled: true } } },
  });

  const streams: { name: string; rtspUrl: string; rtspUrlSub: string }[] = [];
  // Хосты регистраторов этого агента — агент проксирует HTTP-запросы (CGI,
  // проверка часов) не только к своему go2rtc, но и напрямую к регистратору;
  // allowlist на стороне агента строится из этого списка (см. agent/agent.mjs).
  const allowedTargets = new Set<string>();
  for (const device of devices) {
    let password: string;
    try {
      password = decryptSecret(device.passwordEnc);
    } catch (e) {
      console.error(`[agent-config] не удалось расшифровать пароль устройства ${device.id}:`, e);
      continue;
    }
    const vendor = CAMERA_VENDORS[device.vendor];
    const override = (device.urlOverride as UrlOverride | null) ?? {};
    allowedTargets.add(`${device.host}:${device.httpPort}`);

    for (const camera of device.cameras) {
      const ctx = {
        host: device.host, rtspPort: device.rtspPort, httpPort: device.httpPort,
        username: device.username, password, channel: camera.channel,
      };
      try {
        const rtspUrl = override.rtspUrl || vendor.rtspUrl(ctx);
        const rtspUrlSub = override.rtspUrlSub || vendor.rtspUrlSub(ctx);
        streams.push({ name: `cam_${camera.id}`, rtspUrl, rtspUrlSub });
      } catch (e) {
        console.error(`[agent-config] пропускаю камеру ${camera.id} (${device.vendor}):`, e);
      }
    }
  }

  return NextResponse.json({ streams, allowedTargets: [...allowedTargets] });
}
