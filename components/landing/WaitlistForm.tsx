"use client";

import { useActionState } from "react";
import { submitLeadAction } from "@/app/waitlist/actions";

const initial = { ok: false, error: "" } as const;

export function WaitlistForm() {
  const [state, action, pending] = useActionState(submitLeadAction, initial);
  if (state.ok) {
    return <div className="border border-land-signal bg-land-surface p-6 text-left"><h3 className="font-landing-display font-bold text-land-h3 text-land-ink">Заявка принята</h3><p className="font-landing-text text-land-body text-land-muted mt-3">Мы строим модуль общепита и свяжемся с вами перед запуском, чтобы показать готовый сценарий и обсудить вашу точку.</p></div>;
  }
  return (
    <form action={action} className="grid sm:grid-cols-2 gap-4 text-left">
      <label><span className="field-label">Имя</span><input required name="name" className="field" /></label>
      <label><span className="field-label">Телефон или Telegram</span><div className="flex gap-2"><input required name="contact" className="field min-w-0 flex-1" placeholder="+7... или @username" /><select name="contactType" className="field w-28"><option value="phone">телефон</option><option value="telegram">Telegram</option></select></div></label>
      <label><span className="field-label">Тип точки</span><select required name="venueType" className="field"><option value="">Выберите</option><option>Продуктовый магазин</option><option>Магазин у дома</option><option>Пекарня</option><option>Кофейня</option><option>Кондитерская</option><option>Столовая</option><option>Другое</option></select></label>
      <label><span className="field-label">Город</span><input required name="city" className="field" /></label>
      <label><span className="field-label">Сколько точек</span><select required name="pointsCount" className="field"><option value="">Выберите</option><option>1</option><option>2-3</option><option>Больше 3</option></select></label>
      <label><span className="field-label">Как ведёте учёт сейчас</span><select required name="currentSystem" className="field"><option value="">Выберите</option><option>Тетрадь</option><option>Excel</option><option>1С</option><option>iiko, Poster или похожее</option><option>Никак</option></select></label>
      <label className="sm:col-span-2"><span className="field-label">Что больше всего мешает?</span><textarea name="painPoint" rows={3} className="field resize-none" placeholder="Например: не понимаю, куда уходит мука или на чём зарабатываю" /></label>
      <label className="sm:col-span-2 flex items-start gap-2 font-landing-text text-land-small text-land-ink"><input type="checkbox" name="readyToCall" className="mt-1" />Готов созвониться и рассказать про свою точку</label>
      <label className="sm:col-span-2 flex items-start gap-2 font-landing-text text-land-small text-land-muted">
        <input required type="checkbox" name="consent" className="mt-1" />
        Согласен на обработку персональных данных в соответствии с{" "}
        <a href="/legal/privacy" target="_blank" className="underline underline-offset-2 hover:text-land-ink">политикой конфиденциальности</a>
      </label>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      {state.error && <p className="sm:col-span-2 text-land-signal font-landing-text text-land-small">{state.error}</p>}
      <button disabled={pending} className="sm:col-span-2 justify-self-start inline-flex h-14 px-7 items-center bg-land-signal text-land-paper rounded-land-control font-landing-text font-medium hover:bg-land-signal-d disabled:opacity-60">{pending ? "Отправляем..." : "Оставить заявку"}</button>
    </form>
  );
}