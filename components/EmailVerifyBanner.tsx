"use client";
import { useActionState, useState } from "react";
import { verifyEmailAction } from "@/app/verify-email/actions";

// Мягкий баннер: не блокирует ни одного экрана (регистрация уже дала полный
// доступ), просто напоминает подтвердить почту. Код сейчас приходит только
// в консоль сервера (server/email/sender.ts) — SMTP не подключён.
export function EmailVerifyBanner({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [state, action, pending] = useActionState(verifyEmailAction, null as { error?: string; ok?: boolean } | null);

  if (dismissed || state?.ok) return null;

  return (
    <div className="bg-warn/10 border-b border-warn/40 px-3 sm:px-4 py-2 text-sm">
      <div className="max-w-6xl mx-auto flex items-center gap-3 flex-wrap">
        <span className="text-warn-text">Подтвердите почту {email} — код сейчас в логе сервера, SMTP пока не подключён.</span>
        {!open ? (
          <button type="button" onClick={() => setOpen(true)} className="underline underline-offset-2 hover:text-ink shrink-0">
            Ввести код
          </button>
        ) : (
          <form action={action} className="flex items-center gap-2 shrink-0">
            <input
              name="code"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              autoFocus
              className="h-8 w-24 px-2 bg-paper border border-line rounded-tag font-app-mono text-center"
            />
            <button type="submit" disabled={pending} className="h-8 px-3 rounded-tag bg-ink text-paper text-xs font-medium disabled:opacity-50">
              {pending ? "…" : "Подтвердить"}
            </button>
          </form>
        )}
        {state?.error && <span className="text-stamp-text text-xs">{state.error}</span>}
        <button type="button" onClick={() => setDismissed(true)} className="ml-auto text-ink-soft hover:text-ink shrink-0" aria-label="Скрыть баннер">
          ×
        </button>
      </div>
    </div>
  );
}
