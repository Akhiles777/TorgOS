"use client";
import { useMemo, useState } from "react";
import { money0, unitLabel } from "@/lib/format";
import type { PosProduct } from "./types";

// Панель быстрого выбора справа. Без поиска — только избранные плитки
// (товары с флагом «показывать в кассе»: без штрихкода, тяжёлые бутылки и т.п.).
// При вводе в поиск — ищем по ВСЕМ товарам (в т.ч. без штрихкода). Если точного
// совпадения нет — кнопка «Спросить ИИ»: модель подберёт ближайшее даже с опечатками.
export function Tiles({
  products,
  stock,
  query,
  onPick,
  onAiSearch,
}: {
  products: PosProduct[];
  stock: Record<string, number>;
  query: string;
  onPick: (p: PosProduct) => void;
  onAiSearch: (query: string) => Promise<string[]>;
}) {
  const [cat, setCat] = useState("Все");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiIds, setAiIds] = useState<string[] | null>(null);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  // Категории — по избранным (то, что показывается плитками без поиска).
  const categories = useMemo(() => {
    const set = new Set(products.filter((p) => p.showInPos).map((p) => p.category));
    return ["Все", ...[...set].sort((a, b) => a.localeCompare(b, "ru"))];
  }, [products]);

  const shown = useMemo(() => {
    if (searching) {
      // Глобальный поиск по названию/штрихкоду, без ограничения категорией.
      return products.filter((p) => p.name.toLowerCase().includes(q) || (p.barcode ?? "").includes(q));
    }
    // Без поиска — только избранные плитки, с фильтром по категории.
    return products.filter((p) => p.showInPos && (cat === "Все" || p.category === cat));
  }, [products, cat, q, searching]);

  const aiProducts = useMemo(() => {
    if (!aiIds) return [];
    const byId = new Map(products.map((p) => [p.id, p]));
    return aiIds.map((id) => byId.get(id)).filter((p): p is PosProduct => !!p);
  }, [aiIds, products]);

  const runAi = async () => {
    setAiBusy(true);
    setAiIds(null);
    try {
      setAiIds(await onAiSearch(query.trim()));
    } finally {
      setAiBusy(false);
    }
  };

  const renderTile = (p: PosProduct) => {
    const currentStock = stock[p.id] ?? p.stock;
    const low = currentStock <= (p.unit === "KG" ? 1 : 3);
    const out = currentStock <= 0;
    return (
      <button
        key={p.id}
        onClick={() => onPick(p)}
        disabled={out}
        className="relative text-left min-h-[92px] p-3 rounded-tag border border-line bg-paper-2 hover:border-ink active:scale-[0.98] transition flex flex-col justify-between disabled:opacity-50"
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
  };

  return (
    <div className="flex flex-col h-full">
      {!searching && (
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
      )}

      <div className="flex-1 overflow-y-auto -mx-1 px-1">
        {shown.length > 0 ? (
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
            {shown.map(renderTile)}
          </div>
        ) : searching ? (
          <div className="text-center py-8">
            <p className="text-ink-soft mb-3">По запросу «{query.trim()}» ничего не нашлось.</p>
            <button
              onClick={runAi}
              disabled={aiBusy}
              className="h-11 px-4 rounded-tag bg-ink text-paper font-medium disabled:opacity-50"
            >
              {aiBusy ? "ИИ ищет…" : "🔍 Спросить ИИ"}
            </button>
            {aiIds && aiProducts.length > 0 && (
              <>
                <p className="text-sm text-ink-soft mt-5 mb-2">Возможно, вы имели в виду:</p>
                <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))] text-left">
                  {aiProducts.map(renderTile)}
                </div>
              </>
            )}
            {aiIds && aiProducts.length === 0 && !aiBusy && (
              <p className="text-sm text-ink-soft mt-4">ИИ тоже не нашёл подходящего товара.</p>
            )}
          </div>
        ) : (
          <p className="text-ink-soft text-center py-10 px-6 leading-relaxed">
            Здесь — товары для быстрого выбора без сканера.<br />
            Включите «Показывать в кассе» у нужных товаров в админке.
          </p>
        )}
      </div>
    </div>
  );
}
