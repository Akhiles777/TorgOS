"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Plan, SubscriptionStatus } from "@prisma/client";
import { Button, ConfirmDialog } from "@/components/ui";
import type { getOrganizationDetail } from "@/server/services/rootAdmin";
import { updatePlanAction, extendTrialAction, setStatusAction, deleteOrgAction, resetPasswordAction, impersonateAction } from "@/app/root/actions";

type Org = NonNullable<Awaited<ReturnType<typeof getOrganizationDetail>>>;

const PLANS: Plan[] = ["TRIAL", "BASIC", "PRO"];
const STATUSES: SubscriptionStatus[] = ["TRIAL", "ACTIVE", "PAST_DUE", "CANCELLED", "SUSPENDED"];
const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  TRIAL: "Триал", ACTIVE: "Активна", PAST_DUE: "Просрочена", CANCELLED: "Отменена", SUSPENDED: "Приостановлена",
};
const ROLE_LABEL: Record<string, string> = { OWNER: "Владелец", ADMIN: "Администратор", CASHIER: "Кассир" };

export function OrganizationDetail({ org }: { org: Org }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState("14");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteName, setDeleteName] = useState("");
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ userId: string; password: string } | null>(null);
  const [impersonateTarget, setImpersonateTarget] = useState<{ id: string; name: string } | null>(null);
  const [statusValue, setStatusValue] = useState(org.subscriptionStatus);
  const [pendingStatus, setPendingStatus] = useState<SubscriptionStatus | null>(null);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Не удалось выполнить действие");
    else router.refresh();
  };

  const doResetPassword = async (userId: string) => {
    setResetFor(userId);
    const res = await resetPasswordAction(userId);
    setResetFor(null);
    if (!res.ok) {
      setError(res.error ?? "Не удалось сбросить пароль");
      return;
    }
    setResetResult({ userId, password: res.password! });
  };

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <h1 className="text-lg font-semibold">{org.name}</h1>
        <span className="font-app-mono text-xs text-ink-soft">{org.id}</span>
      </div>
      <p className="text-xs text-ink-soft mb-5">
        {org.type === "RETAIL" ? "Магазин" : "Общепит"} · создана {new Date(org.createdAt).toLocaleDateString("ru-RU")}
      </p>

      {error && <p className="text-stamp-text text-sm mb-3">{error}</p>}

      {/* ── Биллинг ── */}
      <section className="border border-line rounded-tag p-4 mb-5">
        <h2 className="text-sm font-semibold text-ink-soft mb-3">Биллинг</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-ink-soft mb-1">Тариф</label>
            <select
              defaultValue={org.plan}
              disabled={busy}
              onChange={(e) => run(() => updatePlanAction(org.id, e.target.value as Plan))}
              className="w-full h-9 px-2 bg-paper border border-line rounded-tag text-sm"
            >
              {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink-soft mb-1">Статус подписки</label>
            <select
              value={statusValue}
              disabled={busy}
              onChange={(e) => {
                const next = e.target.value as SubscriptionStatus;
                // Приостановка/отмена реально блокирует доступ живой организации
                // (см. server/guard.ts::isBillingBlocked) — такое стоит подтвердить,
                // а не менять одним случайным кликом по выпадающему списку.
                if (next === "SUSPENDED" || next === "CANCELLED") setPendingStatus(next);
                else {
                  setStatusValue(next);
                  run(() => setStatusAction(org.id, next));
                }
              }}
              className="w-full h-9 px-2 bg-paper border border-line rounded-tag text-sm"
            >
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink-soft mb-1">
              Триал до {org.trialEndsAt ? new Date(org.trialEndsAt).toLocaleDateString("ru-RU") : "— (не ограничен)"}
            </label>
            <div className="flex gap-1.5">
              <input
                value={extendDays}
                onChange={(e) => setExtendDays(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                className="w-16 h-9 px-2 bg-paper border border-line rounded-tag text-sm font-app-mono text-center"
              />
              <Button variant="line" disabled={busy} onClick={() => run(() => extendTrialAction(org.id, Number(extendDays) || 0))}>
                Продлить, дн.
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Точки ── */}
      <section className="mb-5">
        <h2 className="text-sm font-semibold text-ink-soft mb-2">Точки · {org.stores.length}</h2>
        <div className="border border-line rounded-tag overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="bg-paper-2 text-ink-soft text-left">
                <th className="px-3 py-1.5 font-medium">Название</th>
                <th className="px-3 py-1.5 font-medium">Город</th>
                <th className="px-3 py-1.5 font-medium">Часовой пояс</th>
                <th className="px-3 py-1.5 font-medium text-right">Товаров</th>
              </tr>
            </thead>
            <tbody>
              {org.stores.map((s) => (
                <tr key={s.id} className="border-t border-line">
                  <td className="px-3 py-1.5 font-medium">{s.name}</td>
                  <td className="px-3 py-1.5 text-ink-soft">{s.city ?? "—"}</td>
                  <td className="px-3 py-1.5 text-ink-soft font-app-mono text-xs">{s.timezone}</td>
                  <td className="px-3 py-1.5 text-right font-app-mono">{s.productCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Пользователи ── */}
      <section className="mb-5">
        <h2 className="text-sm font-semibold text-ink-soft mb-2">Пользователи · {org.users.length}</h2>
        <div className="border border-line rounded-tag overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-paper-2 text-ink-soft text-left">
                <th className="px-3 py-1.5 font-medium">Имя</th>
                <th className="px-3 py-1.5 font-medium">Логин</th>
                <th className="px-3 py-1.5 font-medium">Роль</th>
                <th className="px-3 py-1.5 font-medium text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {org.users.map((u) => (
                <tr key={u.id} className="border-t border-line align-top">
                  <td className="px-3 py-1.5 font-medium">{u.name}</td>
                  <td className="px-3 py-1.5 text-ink-soft font-app-mono text-xs">{u.login}</td>
                  <td className="px-3 py-1.5 text-ink-soft">{ROLE_LABEL[u.role] ?? u.role}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setImpersonateTarget({ id: u.id, name: u.name })}
                        className="h-7 px-2 rounded-tag border border-line text-xs hover:bg-paper-2"
                      >
                        Войти как
                      </button>
                      <button
                        onClick={() => doResetPassword(u.id)}
                        disabled={resetFor === u.id}
                        className="h-7 px-2 rounded-tag border border-line text-xs hover:bg-paper-2 disabled:opacity-50"
                      >
                        {resetFor === u.id ? "…" : "Сбросить пароль"}
                      </button>
                    </div>
                    {resetResult?.userId === u.id && (
                      <div className="mt-1.5 text-right">
                        <span className="font-app-mono text-xs bg-warn/10 text-warn-text px-2 py-1 rounded-tag inline-block">
                          Новый пароль: {resetResult.password} — сохраните, больше не покажется
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Опасная зона ── */}
      <section className="border border-stamp/40 rounded-tag p-4">
        <h2 className="text-sm font-semibold text-stamp-text mb-2">Удаление организации</h2>
        <p className="text-xs text-ink-soft mb-3">
          Необратимо: удалятся все точки, товары, чеки и пользователи этой организации. Чтобы подтвердить, наберите
          точное название — «{org.name}».
        </p>
        <div className="flex gap-2">
          <input
            value={deleteName}
            onChange={(e) => setDeleteName(e.target.value)}
            placeholder={org.name}
            className="h-9 px-3 bg-paper border border-line rounded-tag text-sm flex-1 max-w-xs"
          />
          <Button variant="stamp" disabled={deleteName !== org.name || busy} onClick={() => setDeleteConfirm(true)}>
            Удалить организацию
          </Button>
        </div>
      </section>

      <ConfirmDialog
        open={deleteConfirm}
        title={`Удалить «${org.name}» безвозвратно?`}
        body="Это действие нельзя отменить."
        confirmLabel="Удалить"
        onConfirm={() => { setDeleteConfirm(false); run(() => deleteOrgAction(org.id, deleteName)); }}
        onCancel={() => setDeleteConfirm(false)}
      />

      <ConfirmDialog
        open={!!pendingStatus}
        title={`Сменить статус на «${pendingStatus ? STATUS_LABEL[pendingStatus] : ""}»?`}
        body="Организация сразу потеряет доступ ко всем экранам — увидит /billing/expired при следующем действии."
        confirmLabel="Сменить статус"
        onConfirm={() => {
          if (!pendingStatus) return;
          const next = pendingStatus;
          setPendingStatus(null);
          setStatusValue(next);
          run(() => setStatusAction(org.id, next));
        }}
        onCancel={() => setPendingStatus(null)}
      />

      <ConfirmDialog
        open={!!impersonateTarget}
        title={`Войти как «${impersonateTarget?.name}»?`}
        body="Действие попадёт в аудит-лог. Сессия подмены короче обычной (2 часа)."
        confirmLabel="Войти"
        danger={false}
        onConfirm={() => { if (impersonateTarget) run(() => impersonateAction(impersonateTarget.id)); setImpersonateTarget(null); }}
        onCancel={() => setImpersonateTarget(null)}
      />
    </div>
  );
}
