import { NextResponse } from "next/server";

// ВАЖНО: GET /logout НЕ удаляет сессию. Любой GET могут вызвать без ведома
// пользователя — префетч <Link> в проде, превью ссылок в мессенджерах,
// антивирусные/почтовые сканеры URL. Раньше этот GET разлогинивал, и
// префетч ссылки «Выйти» убивал сессию сам по себе → «постоянно требует
// входа». Настоящий выход теперь только POST-экшеном (app/logout/action.ts).
// GET оставляем лишь как безобидный редирект для старых закладок на /logout.
export async function GET(req: Request) {
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  const host = req.headers.get("host") ?? new URL(req.url).host;
  return NextResponse.redirect(`${proto}://${host}/login`);
}
