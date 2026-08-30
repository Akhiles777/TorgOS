"use client";
import { useActionState } from "react";
import { loginAction } from "./actions";
import { Button, Field } from "@/components/ui";

export function LoginForm({ next = "" }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, null as { error?: string } | null);
  return (
    <form action={action} className="space-y-4">
      {/* Куда вернуть после входа — сервер проверяет это значение ещё раз. */}
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Логин" name="login" autoFocus autoComplete="username" placeholder="gasan" />
      <Field label="Пароль" name="password" type="password" autoComplete="current-password" placeholder="••••••" />
      {state?.error && <p className="text-stamp-text text-sm">{state.error}</p>}
      <Button type="submit" variant="stamp" size="lg" className="w-full" disabled={pending}>
        {pending ? "Входим…" : "Войти"}
      </Button>
    </form>
  );
}
