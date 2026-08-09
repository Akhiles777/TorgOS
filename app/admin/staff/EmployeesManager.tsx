"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, EmptyState, ConfirmDialog } from "@/components/ui";
import { Overlay } from "@/components/pos/WeightModal";
import { createEmployeeAction, deactivateEmployeeAction } from "../actions";

type Employee = { id: string; name: string };

// Сотрудники смены — те, кого касса показывает в вопросе «Кто на смене?».
// Это не логины: они не входят в систему, просто выбираются тапом на кассе.
export function EmployeesManager({ employees }: { employees: Employee[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Employee | null>(null);
  const [pending, start] = useTransition();

  const remove = () => {
    if (!removing) return;
    const id = removing.id;
    setRemoving(null);
    start(async () => {
      await deactivateEmployeeAction(id);
      router.refresh();
    });
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-xl font-semibold mr-auto">Кто работает на кассе</h1>
        <Button variant="stamp" onClick={() => setAdding(true)}>+ Сотрудник</Button>
      </div>
      <p className="text-sm text-ink-soft mb-4">
        Эти имена касса показывает в вопросе «Кто на смене?». Отдельного входа им не нужно —
        выбираются одним нажатием. Смена спрашивается раз в сутки (после 7:00).
      </p>

      {employees.length === 0 ? (
        <EmptyState>Пока никого. Добавьте, кто стоит за кассой.</EmptyState>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {employees.map((e) => (
            <div key={e.id} className="border border-line rounded-tag bg-paper-2 p-3 flex items-center justify-between gap-2">
              <span className="font-medium">{e.name}</span>
              <button
                onClick={() => setRemoving(e)}
                disabled={pending}
                className="h-9 px-3 rounded-tag border border-line text-sm text-ink-soft hover:text-stamp-text hover:border-stamp disabled:opacity-50"
              >
                Убрать
              </button>
            </div>
          ))}
        </div>
      )}

      {adding && <AddEmployeeModal onClose={() => setAdding(false)} />}
      <ConfirmDialog
        open={!!removing}
        title={`Убрать «${removing?.name}» из списка смен?`}
        body="История его продаж сохранится — из вопроса «Кто на смене?» он просто пропадёт."
        confirmLabel="Убрать"
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

function AddEmployeeModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onSubmit = (fd: FormData) => {
    start(async () => {
      const res = await createEmployeeAction(null, fd);
      if (res.ok) { onClose(); router.refresh(); }
      else setError(res.error);
    });
  };

  return (
    <Overlay onCancel={onClose}>
      <form action={onSubmit} className="w-[min(92vw,400px)] space-y-3">
        <h2 className="text-xl font-semibold">Новый сотрудник смены</h2>
        <label className="block">
          <span className="text-sm text-ink-soft">Имя</span>
          <input name="name" required autoFocus placeholder="Например: Рита Юсупова"
            className="w-full h-11 px-3 bg-paper border border-line rounded-tag focus:border-ink" />
        </label>
        {error && <p className="text-stamp-text text-sm">{error}</p>}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <Button type="button" variant="line" size="lg" onClick={onClose}>Отмена</Button>
          <Button type="submit" variant="stamp" size="lg" disabled={pending}>{pending ? "…" : "Добавить"}</Button>
        </div>
      </form>
    </Overlay>
  );
}
