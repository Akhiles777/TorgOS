"use client";
import { useActionState, useState } from "react";
import { registerAction } from "./actions";
import { Button, Field, SegmentedControl } from "@/components/ui";

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, null as { error?: string } | null);
  const [type, setType] = useState<"RETAIL" | "HORECA">("RETAIL");

  return (
    <form action={action} className="space-y-5">
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-ink-soft uppercase tracking-wide mb-1">Организация</legend>
        <Field label="Название" name="orgName" autoFocus placeholder="Гастроном" required />
        <input type="hidden" name="orgType" value={type} />
        <SegmentedControl
          fill
          value={type}
          onChange={setType}
          options={[
            { value: "RETAIL", label: "Магазин" },
            { value: "HORECA", label: "Кафе / общепит" },
          ]}
        />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-ink-soft uppercase tracking-wide mb-1">Первая точка</legend>
        <Field label="Название точки" name="storeName" placeholder="Гастроном на Ирчи Казака" required />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Город" name="storeCity" placeholder="Махачкала" />
          <Field label="Адрес" name="storeAddress" placeholder="ул. Ирчи Казака, 31" />
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-ink-soft uppercase tracking-wide mb-1">Владелец</legend>
        <Field label="Ваше имя" name="ownerName" placeholder="Алункачев Гасан" required />
        <Field label="Email" name="email" type="email" placeholder="gasan@example.com" autoComplete="email" required hint="Он же логин для входа" />
        <Field label="Пароль" name="password" type="password" autoComplete="new-password" placeholder="минимум 6 символов" required />
      </fieldset>

      <label className="flex items-start gap-2.5 bg-paper-2 border border-line rounded-tag p-3 cursor-pointer">
        <input type="checkbox" name="demoProducts" className="mt-0.5 w-5 h-5 accent-stamp" />
        <span className="text-sm">
          Заполнить демо-товарами
          <span className="block text-xs text-ink-soft">
            ~20 товаров для пробы кассы — чай, сыры, овощи, курзе, лаваш, напитки. Без выдуманных продаж, можно удалить в любой момент.
          </span>
        </span>
      </label>

      {state?.error && <p className="text-stamp-text text-sm">{state.error}</p>}
      <Button type="submit" variant="stamp" size="lg" className="w-full" disabled={pending}>
        {pending ? "Создаём…" : "Начать бесплатно"}
      </Button>
      <p className="text-xs text-ink-soft text-center">14 дней бесплатно · Карта не нужна</p>
    </form>
  );
}
