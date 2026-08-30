"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { money0, timeShort, qty, unitLabel } from "@/lib/format";
import { Badge, EmptyState, Button, ConfirmDialog } from "@/components/ui";
import type { ReceiptRow } from "@/server/services/receipts";
import { returnSaleAction } from "./actions";

const PM: Record<string, { label: string; tone: "line" | "fresh" | "warn" }> = {
  CASH: { label: "нал", tone: "fresh" },
  CARD: { label: "карта", tone: "line" },
  TRANSFER: { label: "перевод", tone: "warn" },
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function ReceiptsList({ rows }: { rows: ReceiptRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (rows.length === 0) return <EmptyState>Сегодня ещё не было продаж.</EmptyState>;

  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <Receipt key={r.id} row={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
      ))}
    </ul>
  );
}

function Receipt({ row, open, onToggle }: { row: ReceiptRow; open: boolean; onToggle: () => void }) {
  const router = useRouter();
  // Режим возврата включается отдельной кнопкой: раскрыть чек, чтобы просто
  // посмотреть состав, — обычное действие, и оно не должно соседствовать с
  // полями ввода, по которым легко случайно вернуть деньги.
  const [returning, setReturning] = useState(false);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [askAll, setAskAll] = useState(false);
  const [pending, start] = useTransition();

  // Сколько ещё можно вернуть по строке: продано минус уже возвращённое.
  const left = (it: ReceiptRow["items"][number]) => round3(it.quantity - it.returnedQty);
  const returnable = row.items.filter((it) => left(it) > 0);
  const fullyReturned = returnable.length === 0;

  const pickedSum = row.items.reduce((s, it) => s + (picked[it.id] ?? 0) * it.priceAtSale, 0);
  const pickedCount = Object.values(picked).filter((q) => q > 0).length;

  const setQty = (id: string, value: number, max: number) => {
    const q = Math.max(0, Math.min(round3(value), max));
    setPicked((prev) => ({ ...prev, [id]: q }));
    setError(null);
  };

  const submit = (lines: { saleItemId: string; quantity: number }[]) => {
    setError(null);
    start(async () => {
      const res = await returnSaleAction(row.id, lines);
      if (res.ok) {
        setReturning(false);
        setPicked({});
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  const returnAll = () => submit(returnable.map((it) => ({ saleItemId: it.id, quantity: left(it) })));
  const returnPicked = () =>
    submit(
      Object.entries(picked)
        .filter(([, q]) => q > 0)
        .map(([saleItemId, quantity]) => ({ saleItemId, quantity })),
    );

  const net = row.total - row.returnedTotal;

  return (
    <li className="border border-line rounded-tag bg-paper-2 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-paper">
        <span className="font-app-mono text-ink-soft text-sm w-14">№{row.number}</span>
        <span className="font-app-mono text-sm w-12">{timeShort(row.createdAt)}</span>
        <Badge tone={PM[row.paymentMethod].tone}>{PM[row.paymentMethod].label}</Badge>
        {row.returnedTotal > 0 && <Badge tone="stamp">возврат</Badge>}
        <span className="text-ink-soft text-sm hidden sm:block flex-1 truncate">{row.cashier}</span>
        <span className="ml-auto text-right">
          <span className="font-app-mono font-semibold">{money0(net)} ₽</span>
          {row.returnedTotal > 0 && (
            <span className="block text-xs text-ink-soft font-app-mono line-through">{money0(row.total)}</span>
          )}
        </span>
        <span className="text-ink-soft text-xs w-4 text-center">{open ? "▲" : "▾"}</span>
      </button>

      {open && (
        <div className="border-t border-dashed border-line px-3 py-2">
          <ul className="receipt text-sm">
            {row.items.map((it) => {
              const rest = left(it);
              return (
                <li key={it.id} className="py-0.5">
                  <div className="flex items-baseline">
                    <span className="pr-1">{it.name}</span>
                    <span className="leader" aria-hidden />
                    <span className="font-app-mono text-ink-soft mr-3">
                      {qty(it.quantity, it.unit)} {unitLabel(it.unit)} × {money0(it.priceAtSale)}
                    </span>
                    <span className="font-app-mono font-medium w-20 text-right">
                      {money0(it.priceAtSale * it.quantity)}
                    </span>
                  </div>
                  {it.returnedQty > 0 && (
                    <div className="text-xs text-stamp-text">
                      возвращено {qty(it.returnedQty, it.unit)} {unitLabel(it.unit)}
                      {rest > 0 ? ` · осталось ${qty(rest, it.unit)}` : " · полностью"}
                    </div>
                  )}
                  {returning && rest > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mt-1 mb-1.5">
                      <span className="text-xs text-ink-soft">вернуть:</span>
                      <input
                        inputMode="decimal"
                        value={picked[it.id] ?? ""}
                        placeholder="0"
                        onChange={(e) => {
                          const n = parseFloat(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""));
                          setQty(it.id, Number.isFinite(n) ? n : 0, rest);
                        }}
                        className="w-20 h-8 px-2 bg-paper border border-line rounded-tag font-app-mono text-sm focus:border-ink"
                      />
                      <span className="text-xs text-ink-soft">из {qty(rest, it.unit)} {unitLabel(it.unit)}</span>
                      <button
                        type="button"
                        onClick={() => setQty(it.id, rest, rest)}
                        className="text-xs px-2 py-1 rounded-tag border border-line hover:border-ink"
                      >
                        всё
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {row.returnedTotal > 0 && (
            <p className="text-sm text-stamp-text mt-2">Возвращено по чеку: {money0(row.returnedTotal)} ₽</p>
          )}
          {error && <p className="text-sm text-stamp-text mt-2">{error}</p>}

          <div className="flex flex-wrap gap-2 mt-3">
            {fullyReturned ? (
              <span className="text-sm text-ink-soft">Чек возвращён полностью.</span>
            ) : !returning ? (
              <Button variant="line" onClick={() => { setReturning(true); setPicked({}); setError(null); }}>
                Оформить возврат
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => { setReturning(false); setPicked({}); setError(null); }}>
                  Отмена
                </Button>
                <Button variant="line" onClick={() => setAskAll(true)} disabled={pending}>
                  Вернуть чек целиком
                </Button>
                <Button variant="stamp" onClick={returnPicked} disabled={pending || pickedCount === 0}>
                  {pending ? "Оформляем…" : `Вернуть выбранное${pickedSum > 0 ? ` · ${money0(pickedSum)} ₽` : ""}`}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={askAll}
        title={`Вернуть чек №${row.number} целиком?`}
        body={`Покупателю нужно отдать ${money0(row.total - row.returnedTotal)} ₽. Товар вернётся на остаток, чек останется в истории с пометкой о возврате.`}
        confirmLabel="Вернуть целиком"
        onConfirm={() => { setAskAll(false); returnAll(); }}
        onCancel={() => setAskAll(false)}
      />
    </li>
  );
}
