"use client";
import { useMemo, useState } from "react";
import { money0, unitLabel } from "@/lib/format";
import type { PosProduct } from "./types";

// Панель быстрого выбора: категории + крупные плитки (мин. 48px, на деле выше)
// для пальца на дешёвом сенсоре. Плюс поиск по названию.
export function Tiles({
  products,
  stock,
  query,
  onPick,
}: {
  products: PosProduct[];
  stock: Record<string, number>;
  query: string;
  onPick: (p: PosProduct) => void;
}) {
  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category));
    return ["Все", ...[...set].sort((a, b) => a.localeCompare(b, "ru"))];
  }, [products]);
  const [cat, setCat] = useState("Все");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (cat !== "Все" && p.category !== cat) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.barcode ?? "").includes(q)) return false;
      return true;
    });
  }, [products, cat, query]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`shrink-0 h-11 px-4 rounded-tag border text-sm font-medium transition-colors ${
              cat === c ? "bg-ink text-paper border-ink" : "bg-paper border-line hover:bg-paper-2"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto -mx-1 px-1">
        {shown.length === 0 ? (
          <p className="text-ink-soft text-center py-10">Ничего не найдено</p>
        ) : (
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
            {shown.map((p) => {
              const currentStock = stock[p.id] ?? p.stock;
              const low = currentStock <= (p.unit === "KG" ? 1 : 3);
              const out = currentStock <= 0;
              return (
                <button
                  key={p.id}
                  onClick={() => onPick(p)}
                  disabled={out}
                  className="relative text-left min-h-[92px] p-3 rounded-tag border border-line bg-paper-2 hover:border-ink active:scale-[0.98] transition flex flex-col justify-between"
                >
                  <span className="font-medium leading-tight text-[15px] line-clamp-3">{p.name}</span>
                  <span className="flex items-baseline justify-between mt-2">
                    <span className="font-mono-nums font-semibold tabular-nums">
                      {money0(p.price)}
                      <span className="text-ink-soft text-xs">/{unitLabel(p.unit)}</span>
                    </span>
                    {p.unit === "KG" && <span className="text-[10px] text-ink-soft uppercase">вес</span>}
                  </span>
                  {out ? (
                    <span className="absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-stamp/15 text-stamp">нет</span>
                  ) : low ? (
                    <span className="absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-warn/15 text-warn">мало</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
