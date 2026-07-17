import Link from "next/link";
import { getCurrentUser } from "@/server/auth";
import { homeFor } from "@/server/guard";
import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  return (
    <div className="min-h-[100dvh] grid place-items-center p-4">
      <div className="w-[min(92vw,400px)]">
        <div className="text-center mb-6">
          <div className="font-mono-nums text-3xl font-bold tracking-tight">ТоргОС</div>
          <p className="text-ink-soft text-sm mt-1">Касса и учёт магазина</p>
        </div>
        <div className="bg-paper-2 border border-line rounded-tag p-6 receipt-torn">
          <LoginForm />
        </div>
        <p className="text-center text-sm text-ink-soft mt-5">
          Нет аккаунта?{" "}
          <Link href="/register" className="text-stamp font-medium underline underline-offset-2">
            Зарегистрировать магазин
          </Link>
        </p>
      </div>
    </div>
  );
}
