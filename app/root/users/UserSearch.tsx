"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { ConfirmDialog } from "@/components/ui";
import { searchUsersAction, resetPasswordAction, impersonateAction } from "@/app/root/actions";

const ROLE_LABEL: Record<string, string> = { OWNER: "Владелец", ADMIN: "Администратор", CASHIER: "Кассир" };

type Row = { id: string; name: string; login: string; email: string | null; role: string; organizationId: string; organizationName: string };

export function UserSearch() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [pending, startSearch] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ userId: string; password: string } | null>(null);
  const [impersonateTarget, setImpersonateTarget] = useState<Row | null>(null);

  const search = (value: string) => {
    setQ(value);
    setResetResult(null);
    if (value.trim().length < 2) {
      setRows([]);
      return;
    }
    startSearch(async () => {
      setRows(await searchUsersAction(value));
    });
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
      <input
        value={q}
        onChange={(e) => search(e.target.value)}
        placeholder="Имя, логин или email…"
        autoFocus
        className="h-9 px-3 bg-paper border border-line rounded-tag text-sm w-80 max-w-full focus:border-ink"
      />
      {error && <p className="text-stamp-text text-sm mt-2">{error}</p>}

      {q.trim().length >= 2 && (
        <div className="border border-line rounded-tag overflow-x-auto mt-3">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-paper-2 text-ink-soft text-left">
                <th className="px-3 py-1.5 font-medium">Имя</th>
                <th className="px-3 py-1.5 font-medium">Логин</th>
                <th className="px-3 py-1.5 font-medium">Роль</th>
                <th className="px-3 py-1.5 font-medium">Организация</th>
                <th className="px-3 py-1.5 font-medium text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {!pending && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-ink-soft">Никого не нашлось.</td>
                </tr>
              )}
              {rows.map((u) => (
                <tr key={u.id} className="border-t border-line align-top">
                  <td className="px-3 py-1.5 font-medium">{u.name}</td>
                  <td className="px-3 py-1.5 text-ink-soft font-app-mono text-xs">{u.login}</td>
                  <td className="px-3 py-1.5 text-ink-soft">{ROLE_LABEL[u.role] ?? u.role}</td>
                  <td className="px-3 py-1.5">
                    <Link href={`/root/organizations/${u.organizationId}`} className="hover:underline">
                      {u.organizationName}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setImpersonateTarget(u)}
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
      )}

      <ConfirmDialog
        open={!!impersonateTarget}
        title={`Войти как «${impersonateTarget?.name}»?`}
        body="Действие попадёт в аудит-лог. Сессия подмены короче обычной (2 часа)."
        confirmLabel="Войти"
        danger={false}
        onConfirm={async () => {
          if (!impersonateTarget) return;
          const target = impersonateTarget;
          setImpersonateTarget(null);
          const res = await impersonateAction(target.id);
          if (!res.ok) setError(res.error ?? "Не удалось войти как пользователь");
        }}
        onCancel={() => setImpersonateTarget(null)}
      />
    </div>
  );
}
