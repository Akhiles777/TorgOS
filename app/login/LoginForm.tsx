"use client";
import { useActionState } from "react";
import { loginAction } from "./actions";
import { Button, Field } from "@/components/ui";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null as { error?: string } | null);
  return (
    <form action={action} className="space-y-4">
      <Field label="Логин" name="login" autoFocus autoComplete="username" placeholder="magomed" />
      <Field label="Пароль" name="password" type="password" autoComplete="current-password" placeholder="••••••" />
      {state?.error && <p className="text-stamp text-sm">{state.error}</p>}
      <Button type="submit" variant="stamp" size="lg" className="w-full" disabled={pending}>
        {pending ? "Входим…" : "Войти"}
      </Button>
    </form>
  );
}
