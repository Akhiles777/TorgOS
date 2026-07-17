"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { money0 } from "@/lib/format";
import type { PaymentMethod } from "./types";

// Оплата. CASH → «получено» + сдача крупно, на лету. CARD/TRANSFER → одно подтверждение.
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
  onPay: (method: PaymentMethod, cashGiven: number | null) => void;
  onCancel: () => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>(initialMethod);
  const [cash, setCash] = useState("");
  const cashRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (method === "CASH") cashRef.current?.focus();
  }, [method]);

  const given = parseFloat(cash.replace(",", ".")) || 0;
  const change = given - total;
  const canCash = method === "CASH" && given >= total;
  const canPay = method === "CASH" ? canCash : true;

  // Быстрые суммы «под расчёт»: ближайшие круглые купюры
  const quick = useMemo(() => {
    const opts = new Set<number>();
    opts.add(Math.ceil(total));
    for (const step of [50, 100, 500, 1000]) opts.add(Math.ceil(total / step) * step);
    for (const bill of [100, 200, 500, 1000, 2000, 5000]) if (bill >= total) opts.add(bill);
    return [...opts].sort((a, b) => a - b).slice(0, 5);
  }, [total]);

  const pay = () => {
    if (busy || !canPay) return;
    onPay(method, method === "CASH" ? given : null);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/40 grid place-items-center p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}
    >
      <div className="bg-paper rounded-tag border border-line shadow-2xl p-6 w-[min(94vw,560px)]">
        <div className="flex items-end justify-between mb-5">
          <span className="text-ink-soft uppercase tracking-wide text-sm">К оплате</span>
          <span className="font-mono-nums font-bold text-5xl tabular-nums">{money0(total)}<span className="text-2xl"> ₽</span></span>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-5">
          {(["CASH", "CARD", "TRANSFER"] as PaymentMethod[]).map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={`h-14 rounded-tag border font-medium transition-colors ${
                method === m ? "bg-ink text-paper border-ink" : "bg-paper-2 border-line hover:border-ink"
              }`}
            >
              {m === "CASH" ? "Наличные" : m === "CARD" ? "Карта" : "Перевод"}
              <span className="block text-[11px] opacity-60 font-mono-nums">{m === "CASH" ? "F2" : m === "CARD" ? "F3" : "F4"}</span>
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
            <div className="flex flex-wrap gap-2 mt-3">
              {quick.map((q) => (
                <button
                  key={q}
                  onClick={() => setCash(String(q))}
                  className="h-10 px-4 rounded-tag border border-line bg-paper-2 font-mono-nums hover:border-ink"
                >
                  {money0(q)}
                </button>
              ))}
            </div>

            {/* Табло сдачи — крупно, кассир называет вслух */}
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
          <p className="text-ink-soft py-6 text-center">
            {method === "CARD" ? "Приложите карту к терминалу и подтвердите оплату." : "Дождитесь перевода и подтвердите."}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 mt-6">
          <Button variant="line" size="lg" onClick={onCancel} disabled={busy}>
            Назад <span className="opacity-50 text-sm">Esc</span>
          </Button>
          <Button variant="stamp" size="lg" onClick={pay} disabled={!canPay || busy}>
            {busy ? "Пробиваем…" : "Пробить"} <span className="opacity-70 text-sm">Enter</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
