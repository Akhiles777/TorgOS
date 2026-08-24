"use client";
import { useActionState, useState } from "react";
import { registerAction } from "./actions";
import { Button, Field, SegmentedControl } from "@/components/ui";

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, null as { error?: string } | null);
  const [type, setType] = useState<"RETAIL" | "HORECA">("HORECA");

  return (
    <form action={action} className="space-y-5">
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-ink-soft uppercase tracking-wide mb-1">Организация</legend>
        <Field label="Название" name="orgName" autoFocus placeholder={type === "HORECA" ? "Кофейня у моря" : "Гастроном"} required />
        <input type="hidden" name="orgType" value={type} />
        <SegmentedControl
          fill
          value={type}
          onChange={setType}
          options={[
            { value: "HORECA", label: "Кафе / общепит" },
            { value: "RETAIL", label: "Магазин" },
          ]}
        />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-ink-soft uppercase tracking-wide mb-1">Первая точка</legend>
        <Field label="Название точки" name="storeName" placeholder={type === "HORECA" ? "Кофейня на Ирчи Казака" : "Гастроном на Ирчи Казака"} required />
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
          {type === "HORECA" ? "Заполнить демо-меню" : "Заполнить демо-товарами"}
          <span className="block text-xs text-ink-soft">
            {type === "HORECA"
              ? "Пара напитков и выпечки с рецептами и модификатором — для пробы кассы. Без выдуманных продаж, можно удалить в любой момент."
              : "~20 товаров для пробы кассы — чай, сыры, овощи, курзе, лаваш, напитки. Без выдуманных продаж, можно удалить в любой момент."}
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2.5 text-xs text-ink-soft cursor-pointer">
        <input required type="checkbox" name="consent" className="mt-0.5 w-4 h-4 accent-stamp" />
        <span>
          Регистрируясь, вы соглашаетесь с{" "}
          <a href="/legal/offer" target="_blank" className="underline underline-offset-2 hover:text-ink">публичной офертой</a>
          {" "}и{" "}
          <a href="/legal/privacy" target="_blank" className="underline underline-offset-2 hover:text-ink">политикой конфиденциальности</a>
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
