"use client";
import { useActionState, useState } from "react";
import { registerAction } from "./actions";
import { Button, Field } from "@/components/ui";

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, null as { error?: string } | null);
  const [type, setType] = useState<"RETAIL" | "HORECA">("RETAIL");

  return (
    <form action={action} className="space-y-5">
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-ink-soft uppercase tracking-wide mb-1">Организация</legend>
        <Field label="Название" name="orgName" autoFocus placeholder="Гастроном" required />
        <input type="hidden" name="orgType" value={type} />
        <div className="grid grid-cols-2 gap-2">
          {(["RETAIL", "HORECA"] as const).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setType(t)}
              className={`h-11 rounded-tag border font-medium ${
                type === t ? "bg-ink text-paper border-ink" : "bg-paper border-line"
              }`}
            >
              {t === "RETAIL" ? "Магазин" : "Кафе / общепит"}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-ink-soft uppercase tracking-wide mb-1">Первая точка</legend>
        <Field label="Название точки" name="storeName" placeholder="Гастроном на Ирчи Казака" required />
        <Field label="Адрес" name="storeAddress" placeholder="Махачкала, ул. Ирчи Казака, 31" />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-ink-soft uppercase tracking-wide mb-1">Владелец</legend>
        <Field label="Ваше имя" name="ownerName" placeholder="Алункачев Гасан" required />
        <Field label="Логин" name="login" placeholder="gasan" autoComplete="username" required />
        <Field label="Пароль" name="password" type="password" autoComplete="new-password" placeholder="минимум 6 символов" required />
      </fieldset>

      {state?.error && <p className="text-stamp text-sm">{state.error}</p>}
      <Button type="submit" variant="stamp" size="lg" className="w-full" disabled={pending}>
        {pending ? "Создаём…" : "Создать магазин"}
      </Button>
    </form>
  );
}
