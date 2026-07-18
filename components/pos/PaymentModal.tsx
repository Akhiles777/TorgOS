"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { money0 } from "@/lib/format";
import type { PaymentMethod } from "./types";

export type DebtInfo = { debtorName: string; debtorContact: string };

// Оплата. Карту не принимаем — только наличные и перевод.
// CASH → «получено» + сдача крупно, на лету. TRANSFER → одно подтверждение.
// «В долг» → деньги не берём сейчас, чек уходит в раздел «Долги».
export function PaymentModal({
  total,
  initialMethod,
  busy,
  onPay,
  onCancel,
}: {
  total: number;
  initialMethod: PaymentMethod;
  busy: boolean;
  onPay: (method: PaymentMethod, cashGiven: number | null, debt: DebtInfo | null) => void;
  onCancel: () => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>(initialMethod);
  const [cash, setCash] = useState("");
  const [isDebt, setIsDebt] = useState(false);
  const [debtorName, setDebtorName] = useState("");
  const [debtorContact, setDebtorContact] = useState("");
  const cashRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (method === "CASH" && !isDebt) cashRef.current?.focus();
  }, [method, isDebt]);

  const given = parseFloat(cash.replace(",", ".")) || 0;
  const change = given - total;
  const canCash = method === "CASH" && given >= total;
  const canPay = isDebt || (method === "CASH" ? canCash : true);

  const BILLS = [100, 200, 500, 1000, 2000, 5000];
  const quick = useMemo(() => {
    const opts: number[] = [];
    const exact = Math.ceil(total * 100) / 100;
    if (Math.abs(exact - Math.round(exact)) > 0.001) opts.push(exact);
    for (const bill of BILLS) if (bill >= total) opts.push(bill);
    return opts.slice(0, 6);
  }, [total]);

  const pay = () => {
    if (busy || !canPay) return;
    onPay(
      method,
      !isDebt && method === "CASH" ? given : null,
      isDebt ? { debtorName: debtorName.trim(), debtorContact: debtorContact.trim() } : null,
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/40 grid place-items-center p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}
    >
      <div className="bg-paper rounded-tag border border-line shadow-2xl p-6 w-[min(94vw,560px)] max-h-[94dvh] overflow-y-auto">
        <div className="flex items-end justify-between mb-4">
          <span className="text-ink-soft uppercase tracking-wide text-sm">{isDebt ? "В долг" : "К оплате"}</span>
          <span className="font-mono-nums font-bold text-5xl tabular-nums">{money0(total)}<span className="text-2xl"> ₽</span></span>
        </div>

        {/* Переключатель «в долг» */}
        <label className="flex items-center gap-2.5 bg-paper-2 border border-line rounded-tag p-3 mb-4 cursor-pointer">
          <input type="checkbox" checked={isDebt} onChange={(e) => setIsDebt(e.target.checked)} className="w-5 h-5 accent-stamp" />
          <span className="text-sm font-medium">Записать в долг <span className="text-ink-soft font-normal">— деньги получите позже</span></span>
        </label>

        {isDebt ? (
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm text-ink-soft">Имя должника <span className="opacity-60">(необязательно)</span></span>
              <input
                value={debtorName}
                onChange={(e) => setDebtorName(e.target.value)}
                placeholder="Например: Сосед Ахмед"
                autoFocus
                className="w-full h-11 px-3 bg-paper border border-line rounded-tag focus:border-ink"
              />
            </label>
            <label className="block">
              <span className="text-sm text-ink-soft">Контакт <span className="opacity-60">(необязательно)</span></span>
              <input
                value={debtorContact}
                onChange={(e) => setDebtorContact(e.target.value)}
                placeholder="Телефон или как найти"
                className="w-full h-11 px-3 bg-paper border border-line rounded-tag focus:border-ink"
              />
            </label>
            <p className="text-xs text-ink-soft">Дата долга проставится сама. Чек попадёт в раздел «Долги».</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {(["CASH", "TRANSFER"] as PaymentMethod[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`h-14 rounded-tag border font-medium transition-colors ${
                    method === m ? "bg-ink text-paper border-ink" : "bg-paper-2 border-line hover:border-ink"
                  }`}
                >
                  {m === "CASH" ? "Наличные" : "Перевод"}
                  <span className="block text-[11px] opacity-60 font-mono-nums">{m === "CASH" ? "F2" : "F3"}</span>
                </button>
              ))}
            </div>

            {method === "CASH" ? (
              <div>
                <label className="block text-sm text-ink-soft mb-1">Получено</label>
                <input
                  ref={cashRef}
                  inputMode="decimal"
                  value={cash}
                  onChange={(e) => setCash(e.target.value.replace(/[^\d.,]/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && pay()}
                  placeholder="0"
                  className="w-full h-16 px-4 text-4xl font-mono-nums tabular-nums text-center bg-paper border-2 border-line rounded-tag focus:border-ink"
                />
                <p className="text-xs text-ink-soft mt-3 mb-1.5">Какой купюрой рассчитаться — сдача сразу видна:</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {quick.map((q) => {
                    const isExact = Math.abs(q - total) < 0.005;
                    const active = Math.abs(given - q) < 0.005;
                    return (
                      <button
                        key={q}
                        onClick={() => setCash(String(q))}
                        className={`min-h-[52px] px-3 py-1.5 rounded-tag border text-left transition-colors ${
                          active ? "border-ink bg-ink text-paper" : "border-line bg-paper-2 hover:border-ink"
                        }`}
                      >
                        <span className="block font-mono-nums font-semibold tabular-nums">{money0(q)} ₽</span>
                        <span className={`block text-xs font-mono-nums tabular-nums ${active ? "text-paper/70" : "text-ink-soft"}`}>
                          {isExact ? "без сдачи" : `сдача ${money0(q - total)} ₽`}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div
                  className={`mt-5 rounded-tag px-5 py-4 border-2 flex items-end justify-between transition-colors ${
                    canCash ? "border-fresh bg-fresh/10" : "border-line bg-paper-2"
                  }`}
                >
                  <span className="text-ink-soft uppercase tracking-wide">Сдача</span>
                  <span className={`font-mono-nums font-bold text-5xl tabular-nums ${canCash ? "text-fresh" : "text-ink-soft/50"}`}>
                    {canCash ? money0(change) : "—"}<span className="text-2xl"> ₽</span>
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-ink-soft py-6 text-center">Дождитесь перевода и подтвердите.</p>
            )}
          </>
        )}

        <div className="grid grid-cols-2 gap-3 mt-6">
          <Button variant="line" size="lg" onClick={onCancel} disabled={busy}>
            Назад <span className="opacity-50 text-sm">Esc</span>
          </Button>
          <Button variant="stamp" size="lg" onClick={pay} disabled={!canPay || busy}>
            {busy ? "Пробиваем…" : isDebt ? "Записать в долг" : "Пробить"} <span className="opacity-70 text-sm">Enter</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
