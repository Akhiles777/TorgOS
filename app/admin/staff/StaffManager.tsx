"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Badge } from "@/components/ui";
import { Overlay } from "@/components/pos/WeightModal";
import { createStaffAction } from "../actions";
import type { Role } from "@prisma/client";

const ROLE_LABEL: Record<Role, string> = { OWNER: "Владелец", ADMIN: "Администратор", CASHIER: "Кассир" };

export function StaffManager({ staff }: { staff: { id: string; name: string; login: string; role: Role }[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-xl font-semibold mr-auto">Сотрудники точки</h1>
        <Button variant="stamp" onClick={() => setAdding(true)}>+ Сотрудник</Button>
      </div>
      <div className="overflow-x-auto border border-line rounded-tag">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="bg-paper-2 text-ink-soft text-left">
              <th className="px-3 py-2 font-medium">Имя</th>
              <th className="px-3 py-2 font-medium">Логин</th>
              <th className="px-3 py-2 font-medium">Роль</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className="border-t border-line">
                <td className="px-3 py-2 font-medium">{s.name}</td>
                <td className="px-3 py-2 font-mono-nums text-ink-soft">{s.login}</td>
                <td className="px-3 py-2">
                  <Badge tone={s.role === "OWNER" ? "stamp" : s.role === "ADMIN" ? "warn" : "fresh"}>{ROLE_LABEL[s.role]}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adding && <AddStaffModal onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddStaffModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [role, setRole] = useState<Role>("CASHIER");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onSubmit = (fd: FormData) => {
    fd.set("role", role);
    start(async () => {
      const res = await createStaffAction(null, fd);
      if (res.ok) { onClose(); router.refresh(); }
      else setError(res.error);
    });
  };

  return (
    <Overlay onCancel={onClose}>
      <form action={onSubmit} className="w-[min(92vw,420px)] space-y-3">
        <h2 className="text-xl font-semibold">Новый сотрудник</h2>
        <label className="block">
          <span className="text-sm text-ink-soft">Имя</span>
          <input name="name" required autoFocus className="w-full h-11 px-3 bg-paper border border-line rounded-tag focus:border-ink" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(["CASHIER", "ADMIN"] as const).map((r) => (
            <button type="button" key={r} onClick={() => setRole(r)}
              className={`h-11 rounded-tag border font-medium ${role === r ? "bg-ink text-paper border-ink" : "bg-paper border-line"}`}>
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="text-sm text-ink-soft">Логин</span>
          <input name="login" required autoComplete="off" className="w-full h-11 px-3 bg-paper border border-line rounded-tag font-mono-nums focus:border-ink" />
        </label>
        <label className="block">
          <span className="text-sm text-ink-soft">Пароль</span>
          <input name="password" required minLength={6} autoComplete="new-password" className="w-full h-11 px-3 bg-paper border border-line rounded-tag focus:border-ink" />
        </label>
        {error && <p className="text-stamp text-sm">{error}</p>}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <Button type="button" variant="line" size="lg" onClick={onClose}>Отмена</Button>
          <Button type="submit" variant="stamp" size="lg" disabled={pending}>{pending ? "…" : "Добавить"}</Button>
        </div>
      </form>
    </Overlay>
  );
}
