import { NextResponse } from "next/server";
import { logout } from "@/server/auth";

export async function GET(req: Request) {
  await logout();
  // Не строим URL от req.url — в custom-server-режиме (server.mjs без явного
  // hostname/port в next({...})) Next подставляет туда свой внутренний порт
  // по умолчанию (3000), а не тот, на котором реально слушает сервер.
  // Заголовок Host — то, что реально прислал браузер/Nginx, всегда верно.
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  const host = req.headers.get("host") ?? new URL(req.url).host;
  return NextResponse.redirect(`${proto}://${host}/login`);
}

export const POST = GET;
