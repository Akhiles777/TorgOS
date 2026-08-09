"use client";
import { useActionState } from "react";
import { rootLoginAction } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(rootLoginAction, null as { error?: string } | null);
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="block text-xs text-ink-soft mb-1">Email</span>
        <input
          name="email"
          type="email"
          autoFocus
          autoComplete="username"
          required
          className="w-full h-10 px-3 bg-paper border border-line rounded-tag text-sm focus:border-ink"
        />
      </label>
      <label className="block">
        <span className="block text-xs text-ink-soft mb-1">Пароль</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full h-10 px-3 bg-paper border border-line rounded-tag text-sm focus:border-ink"
        />
      </label>
      {state?.error && <p className="text-stamp-text text-sm">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full h-10 rounded-tag bg-ink text-paper text-sm font-medium disabled:opacity-50"
      >
        {pending ? "Входим…" : "Войти"}
      </button>
    </form>
  );
}
