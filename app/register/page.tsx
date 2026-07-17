import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { homeFor } from "@/server/guard";
import { RegisterForm } from "./RegisterForm";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  return (
    <div className="min-h-[100dvh] grid place-items-center p-4 py-10">
      <div className="w-[min(94vw,480px)]">
        <div className="text-center mb-6">
          <div className="font-mono-nums text-3xl font-bold tracking-tight">ТоргОС</div>
          <p className="text-ink-soft text-sm mt-1">Заведём ваш магазин за минуту</p>
        </div>
        <div className="bg-paper-2 border border-line rounded-tag p-6">
          <RegisterForm />
        </div>
        <p className="text-center text-sm text-ink-soft mt-5">
          Уже есть аккаунт?{" "}
          <Link href="/login" className="text-stamp font-medium underline underline-offset-2">
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
