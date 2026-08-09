"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Modal, ReadoutPanel, SegmentedControl } from "@/components/ui";
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
  const enough = given >= total; // введено и хватает → есть сдача
  const tooLittle = given > 0 && given < total; // введено, но мало → нельзя
  // Ввод необязателен: пусто (given=0) = «под расчёт». Мало = запрет.
  const canPay = isDebt || method === "TRANSFER" || !tooLittle;

  // Умная подсказка купюр РФ: чем реально может рассчитаться покупатель —
  // точная сумма, ближайшие «круглые» (10/50/100/500/1000) и одиночные купюры.
  const quick = useMemo(() => {
    const t = Math.ceil(total * 100) / 100;
    const set = new Set<number>();
    set.add(Math.ceil(t)); // ровно, без сдачи
    for (const step of [10, 50, 100, 500, 1000]) set.add(Math.ceil(t / step) * step);
    for (const bill of [100, 200, 500, 1000, 2000, 5000]) if (bill >= t) set.add(bill);
    return [...set].filter((v) => v >= t).sort((a, b) => a - b).slice(0, 6);
  }, [total]);

  const pay = () => {
    if (busy || !canPay) return;
    onPay(
      method,
      !isDebt && method === "CASH" && given > 0 ? given : null,
      isDebt ? { debtorName: debtorName.trim(), debtorContact: debtorContact.trim() } : null,
    );
  };

  return (
    <Modal onCancel={() => !busy && onCancel()}>
      <div className="w-[min(94vw,560px)] font-app-text">
        <div className="flex items-end justify-between mb-4">
          <span className="text-ink-soft uppercase tracking-wide text-sm">{isDebt ? "В долг" : "К оплате"}</span>
          <span className="font-app-display font-bold text-5xl tabular-nums">{money0(total)}<span className="text-2xl"> ₽</span></span>
        </div>

        {/* Переключатель «в долг» */}
        <label className="flex items-center gap-2.5 bg-paper-2 border border-line rounded-tag p-3 mb-4 cursor-pointer min-h-14">
          <input type="checkbox" checked={isDebt} onChange={(e) => setIsDebt(e.target.checked)} className="w-5 h-5 accent-stamp" />
          <span className="text-base font-medium">Записать в долг <span className="text-ink-soft font-normal">— деньги получите позже</span></span>
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
            <SegmentedControl
              size="cash"
              className="grid grid-cols-2 mb-5 [&>button]:w-full"
              value={method}
              onChange={setMethod}
              options={[
                { value: "CASH", label: <>Наличные <span className="block text-[11px] opacity-60 font-app-mono">F2</span></> },
                { value: "TRANSFER", label: <>Перевод <span className="block text-[11px] opacity-60 font-app-mono">F3</span></> },
              ]}
            />

            {method === "CASH" ? (
              <div>
                <label className="block text-base text-ink-soft mb-1">Получено <span className="opacity-60">(необязательно — если под расчёт)</span></label>
                <input
                  ref={cashRef}
                  inputMode="decimal"
                  value={cash}
                  onChange={(e) => setCash(e.target.value.replace(/[^\d.,]/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && pay()}
                  placeholder="0"
                  className="w-full h-16 px-4 text-4xl font-app-mono tabular-nums text-center bg-paper border-2 border-line rounded-tag focus:border-ink"
                />
                <p className="text-sm text-ink-soft mt-3 mb-1.5">Какой купюрой рассчитаться — сдача сразу видна:</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {quick.map((q) => {
                    const isExact = Math.abs(q - total) < 0.005;
                    const active = Math.abs(given - q) < 0.005;
                    return (
                      <button
                        key={q}
                        onClick={() => setCash(String(q))}
                        className={`min-h-14 px-3 py-1.5 rounded-tag border text-left transition-colors ${
                          active ? "border-ink bg-ink text-paper" : "border-line bg-paper-2 hover:border-ink"
                        }`}
                      >
                        <span className="block font-app-mono font-semibold tabular-nums">{money0(q)} ₽</span>
                        <span className={`block text-xs font-app-mono tabular-nums ${active ? "text-paper/70" : "text-ink-soft"}`}>
                          {isExact ? "без сдачи" : `сдача ${money0(q - total)} ₽`}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <ReadoutPanel
                  className="mt-5"
                  label={tooLittle ? "Не хватает" : "Сдача"}
                  value={enough ? money0(change) : tooLittle ? money0(total - given) : "—"}
                  tone={enough ? "fresh" : tooLittle ? "stamp" : "paper"}
                />
              </div>
            ) : (
              <p className="text-ink-soft py-6 text-center text-base">Дождитесь перевода и подтвердите.</p>
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
    </Modal>
  );
}
