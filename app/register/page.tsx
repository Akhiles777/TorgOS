// Шрифты приложения — та же пара, что в /pos, /admin/owner и /login.
import "@fontsource-variable/unbounded/wght.css";
import "@fontsource-variable/golos-text/wght.css";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { homeFor } from "@/server/guard";
import { RegisterForm } from "./RegisterForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Регистрация — 14 дней бесплатно",
  description: "Заведите магазин или кафе в ТоргОС за пару минут. 14 дней бесплатно, карта не нужна.",
  alternates: { canonical: "/register" },
};

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  return (
    <div className="min-h-[100dvh] grid place-items-center p-4 py-10 font-app-text">
      <div className="w-[min(94vw,480px)]">
        <div className="text-center mb-6">
          <div className="font-app-display text-3xl font-medium tracking-tight">ТоргОС</div>
          <p className="text-ink-soft text-sm mt-1">Заведём вашу точку за минуту</p>
        </div>
        <div className="bg-paper-2 border border-line rounded-tag p-6 receipt-torn">
          <RegisterForm />
        </div>
        <p className="text-center text-sm text-ink-soft mt-5">
          Уже есть аккаунт?{" "}
          <Link href="/login" className="text-stamp-text font-medium underline underline-offset-2">
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
