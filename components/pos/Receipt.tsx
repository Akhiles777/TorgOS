"use client";
import { money0, qty, unitLabel } from "@/lib/format";
import { ReadoutPanel } from "@/components/ui";
import type { CartLine } from "./types";

// Фирменный элемент: список позиций свёрстан как настоящая кассовая лента.
export function Receipt({
  lines,
  total,
  tearing,
  onInc,
  onDec,
  onRemove,
  title = "ТоргОС · Гастроном",
  emptyStateHint = "Отсканируйте товар или выберите на плитке",
}: {
  lines: CartLine[];
  total: number;
  tearing: boolean;
  onInc: (key: string) => void;
  onDec: (key: string) => void;
  onRemove: (key: string) => void;
  title?: string;
  emptyStateHint?: string;
}) {
  return (
    <div className="flex flex-col h-full font-app-text">
      <div className="px-4 pt-4 pb-2 border-b border-dashed border-line">
        <div className="flex items-baseline justify-between font-app-mono text-ink-soft text-sm">
          <span>{title}</span>
          <span>{new Date().toLocaleDateString("ru-RU")}</span>
        </div>
        <div className="font-app-mono text-xs text-ink-soft mt-1 tracking-wide">— — — — Ч Е К — — — —</div>
      </div>

      <div className={`receipt flex-1 overflow-y-auto ${tearing ? "animate-tear" : ""}`}>
        {lines.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-ink-soft px-6 text-center gap-2">
            <span className="font-app-mono text-5xl opacity-30">↯</span>
            <p className="text-base">{emptyStateHint}</p>
          </div>
        ) : (
          <ul className="py-2">
            {lines.map((l) => (
              <li key={l.key} className="animate-row-in px-4 py-2.5 border-b border-dotted border-line/70">
                <div className="flex items-baseline">
                  <span className="font-medium pr-1">{l.name}</span>
                  <span className="leader" aria-hidden />
                  <span className="font-app-mono font-semibold tabular-nums">{money0(l.price * l.quantity)}</span>
                </div>
                <div className="flex items-center justify-between mt-2 gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onDec(l.key)}
                      className="w-14 h-14 shrink-0 grid place-items-center rounded-tag border border-line text-2xl leading-none hover:bg-paper-2 active:scale-95"
                      aria-label="Уменьшить"
                    >
                      −
                    </button>
                    <span className="font-app-mono text-sm min-w-[4.5rem] text-center tabular-nums">
                      {qty(l.quantity, l.unit)} {unitLabel(l.unit)} × {money0(l.price)}
                    </span>
                    <button
                      onClick={() => onInc(l.key)}
                      className="w-14 h-14 shrink-0 grid place-items-center rounded-tag border border-line text-2xl leading-none hover:bg-paper-2 active:scale-95"
                      aria-label="Увеличить"
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => onRemove(l.key)}
                    className="h-14 px-3 shrink-0 rounded-tag border border-line text-ink-soft text-sm hover:text-stamp-text hover:border-stamp"
                    aria-label={`Удалить ${l.name}`}
                  >
                    Удалить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="receipt-torn border-t-2 border-dashed border-line bg-paper-2 px-4 pt-3 pb-5">
        <ReadoutPanel label="Итого" value={money0(total)} />
      </div>
    </div>
  );
}
