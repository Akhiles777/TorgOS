"use client";
import { money0, qty, unitLabel } from "@/lib/format";
import type { CartLine } from "./types";

// Фирменный элемент: список позиций свёрстан как настоящая кассовая лента.
export function Receipt({
  lines,
  total,
  tearing,
  onInc,
  onDec,
  onRemove,
}: {
  lines: CartLine[];
  total: number;
  tearing: boolean;
  onInc: (key: string) => void;
  onDec: (key: string) => void;
  onRemove: (key: string) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2 border-b border-dashed border-line">
        <div className="flex items-baseline justify-between font-mono-nums text-ink-soft text-sm">
          <span>ТоргОС · Гастроном</span>
          <span>{new Date().toLocaleDateString("ru-RU")}</span>
        </div>
        <div className="font-mono-nums text-xs text-ink-soft mt-1 tracking-wide">— — — — Ч Е К — — — —</div>
      </div>

      <div className={`receipt flex-1 overflow-y-auto ${tearing ? "animate-tear" : ""}`}>
        {lines.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-ink-soft px-6 text-center gap-2">
            <span className="font-mono-nums text-5xl opacity-30">↯</span>
            <p className="text-sm">Отсканируйте товар или выберите на плитке</p>
          </div>
        ) : (
          <ul className="py-2">
            {lines.map((l) => (
              <li key={l.key} className="animate-row-in px-4 py-2 border-b border-dotted border-line/70">
                <div className="flex items-baseline">
                  <span className="font-medium pr-1">{l.name}</span>
                  <span className="leader" aria-hidden />
                  <span className="font-mono-nums font-semibold tabular-nums">{money0(l.price * l.quantity)}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onDec(l.key)}
                      className="w-8 h-8 grid place-items-center rounded-tag border border-line text-lg leading-none hover:bg-paper-2 active:scale-95"
                      aria-label="Уменьшить"
                    >
                      −
                    </button>
                    <span className="font-mono-nums text-sm min-w-[4.5rem] text-center tabular-nums">
                      {qty(l.quantity, l.unit)} {unitLabel(l.unit)} × {money0(l.price)}
                    </span>
                    <button
                      onClick={() => onInc(l.key)}
                      className="w-8 h-8 grid place-items-center rounded-tag border border-line text-lg leading-none hover:bg-paper-2 active:scale-95"
                      aria-label="Увеличить"
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => onRemove(l.key)}
                    className="text-xs text-ink-soft hover:text-stamp px-2 py-1"
                    aria-label={`Удалить ${l.name}`}
                  >
                    удалить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="receipt-torn border-t-2 border-dashed border-line bg-paper-2 px-4 pt-3 pb-5">
        <div className="flex items-end justify-between">
          <span className="text-ink-soft uppercase tracking-wide text-sm mb-1">Итого</span>
          <span className="font-mono-nums font-bold text-4xl tabular-nums leading-none">{money0(total)}<span className="text-2xl"> ₽</span></span>
        </div>
      </div>
    </div>
  );
}
