"use client";
import { useState } from "react";
import { money0, timeShort, qty, unitLabel } from "@/lib/format";
import { Badge } from "@/components/ui";
import type { ReceiptRow } from "@/server/services/receipts";

const PM: Record<string, { label: string; tone: "line" | "fresh" | "warn" }> = {
  CASH: { label: "нал", tone: "fresh" },
  CARD: { label: "карта", tone: "line" },
  TRANSFER: { label: "перевод", tone: "warn" },
};

export function ReceiptsList({ rows }: { rows: ReceiptRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (rows.length === 0) return <p className="text-ink-soft py-10 text-center bg-paper-2 border border-line rounded-tag">Сегодня ещё не было продаж.</p>;

  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.id} className="border border-line rounded-tag bg-paper-2 overflow-hidden">
          <button onClick={() => setOpen(open === r.id ? null : r.id)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-paper">
            <span className="font-mono-nums text-ink-soft text-sm w-14">№{r.number}</span>
            <span className="font-mono-nums text-sm w-12">{timeShort(r.createdAt)}</span>
            <Badge tone={PM[r.paymentMethod].tone}>{PM[r.paymentMethod].label}</Badge>
            <span className="text-ink-soft text-sm hidden sm:block flex-1 truncate">{r.cashier}</span>
            <span className="ml-auto font-mono-nums font-semibold">{money0(r.total)} ₽</span>
            <span className="text-ink-soft text-xs w-4 text-center">{open === r.id ? "▲" : "▾"}</span>
          </button>
          {open === r.id && (
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
      ))}
    </ul>
  );
}
