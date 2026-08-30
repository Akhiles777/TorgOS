import { NextResponse, type NextRequest } from "next/server";

// Единственная задача этого файла — не терять место, где работал человек.
//
// Раньше при пропавшей сессии страница просто редиректила на /login, а после
// входа человек попадал на «домашнюю» страницу своей роли. Со стороны это
// выглядит как «выбросило в начало»: кассир вместо кассы оказывался в другом
// разделе и терял то, что делал.
//
// Проверяем ТОЛЬКО наличие cookie, без обращения к базе: middleware выполняется
// на каждый запрос, и ходить в БД отсюда нельзя. Если cookie есть, но сессия
// протухла — разберётся обычный серверный гард (server/guard.ts).
const COOKIE = "torgos_session";

// Разделы, которые без входа не имеют смысла. Публичные страницы (лендинг,
// оферта, вход, регистрация) сюда не попадают.
const PROTECTED = ["/pos", "/admin", "/owner", "/root"];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // /root — своя, отдельная авторизация супер-админки, её cookie другая.
  if (pathname.startsWith("/root")) return NextResponse.next();
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (req.cookies.has(COOKIE)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // Статику и api не трогаем: api сам отвечает 401, и подменять это редиректом
  // на html-страницу нельзя — клиентский код ждёт JSON.
  matcher: ["/pos/:path*", "/admin/:path*", "/owner/:path*"],
};
