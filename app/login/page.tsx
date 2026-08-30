// Шрифты приложения — та же пара, что в /pos и /admin/owner (см. дизайн-план системы).
import "@fontsource-variable/unbounded/wght.css";
import "@fontsource-variable/golos-text/wght.css";
import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/server/auth";
import { homeFor } from "@/server/guard";
import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";

// Страница входа не должна попадать в выдачу: пользы для поиска нет,
// а краулинговый бюджет она забирает.
export const metadata: Metadata = { title: "Вход", robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  // Только внутренние адреса: «next» приходит из строки браузера, и уводить
  // по нему на чужой сайт после входа нельзя.
  const raw = (await searchParams).next ?? "";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "";
  return (
    <div className="min-h-[100dvh] grid place-items-center p-4 font-app-text">
      <div className="w-[min(92vw,400px)]">
        <div className="text-center mb-6">
          <div className="font-app-display text-3xl font-medium tracking-tight">ТоргОС</div>
          <p className="text-ink-soft text-sm mt-1">Касса и учёт магазина</p>
        </div>
        <div className="bg-paper-2 border border-line rounded-tag p-6 receipt-torn">
          <LoginForm next={next} />
        </div>
        <p className="text-center text-sm text-ink-soft mt-5">
          Нет аккаунта?{" "}
          <Link href="/register" className="text-stamp-text font-medium underline underline-offset-2">
            Зарегистрировать магазин
          </Link>
        </p>
      </div>
    </div>
  );
}
