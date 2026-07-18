"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { money0, timeShort, dateShort, qty, unitLabel } from "@/lib/format";
import { Button, Badge } from "@/components/ui";
import { markDebtPaidAction } from "./actions";
import type { DebtRow } from "@/server/services/debts";

export function DebtsList({ rows }: { rows: DebtRow[] }) {
  const [showPaid, setShowPaid] = useState(false);
  const open = rows.filter((r) => !r.paidAt);
  const paid = rows.filter((r) => r.paidAt);
  const shown = showPaid ? paid : open;

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setShowPaid(false)}
          className={`h-9 px-3 rounded-tag border text-sm ${!showPaid ? "bg-ink text-paper border-ink" : "bg-paper border-line"}`}
        >
          Открытые ({open.length})
        </button>
        <button
          onClick={() => setShowPaid(true)}
          className={`h-9 px-3 rounded-tag border text-sm ${showPaid ? "bg-ink text-paper border-ink" : "bg-paper border-line"}`}
        >
          Погашенные ({paid.length})
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="text-ink-soft py-10 text-center bg-paper-2 border border-line rounded-tag">
          {showPaid ? "Погашенных долгов пока нет." : "Открытых долгов нет — все рассчитались."}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((r) => (
            <DebtCard key={r.id} row={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DebtCard({ row: r }: { row: DebtRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const pay = () => {
    if (!confirm(`Долг №${r.number} на ${money0(r.total)} ₽ погашен?`)) return;
    start(async () => {
      await markDebtPaidAction(r.id);
      router.refresh();
    });
  };

  return (
    <li className="border border-line rounded-tag bg-paper-2 overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5 flex-wrap">
        <span className="font-mono-nums text-ink-soft text-sm w-14">№{r.number}</span>
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{r.debtorName || "Без имени"}</div>
          <div className="text-xs text-ink-soft">
            в долг {dateShort(r.createdAt)} {timeShort(r.createdAt)}
            {r.debtorContact ? ` · ${r.debtorContact}` : ""}
          </div>
        </div>
        <span className="font-mono-nums font-semibold">{money0(r.total)} ₽</span>
        {r.paidAt ? (
          <Badge tone="fresh">погашен {dateShort(r.paidAt)}</Badge>
        ) : (
          <Button variant="fresh" onClick={pay} disabled={pending}>{pending ? "…" : "Погасить"}</Button>
        )}
        <button onClick={() => setOpen(!open)} className="text-ink-soft text-xs w-5 text-center" aria-label="Состав чека">
          {open ? "▲" : "▾"}
        </button>
      </div>
      {open && (
        <div className="receipt border-t border-dashed border-line px-3 py-2">
          <ul className="text-sm">
            {r.items.map((it, i) => (
              <li key={i} className="flex items-baseline py-0.5">
                <span className="pr-1">{it.name}</span>
                <span className="leader" aria-hidden />
                <span className="font-mono-nums text-ink-soft mr-3">{qty(it.quantity, it.unit)} {unitLabel(it.unit)} × {money0(it.priceAtSale)}</span>
                <span className="font-mono-nums font-medium w-20 text-right">{money0(it.priceAtSale * it.quantity)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
