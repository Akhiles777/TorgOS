"use client";
import { useMemo, useState } from "react";
import { money0 } from "@/lib/format";
import { SegmentedControl } from "@/components/ui";
import type { PosMenuCategory, PosMenuItem } from "@/server/services/horeca/pos";

// Плитки блюд по категориям — визуально копирует проверенную сетку
// components/pos/Tiles.tsx (тот же grid/тайл-стиль), но НЕ является его
// правкой: у общепита нет штрихкодов и нет понятия «показывать в кассе» —
// показываются все активные блюда, без сканера и AI-поиска.
export function MenuGrid({
  categories,
  items,
  onPick,
}: {
  categories: PosMenuCategory[];
  items: PosMenuItem[];
  onPick: (item: PosMenuItem) => void;
}) {
  const [cat, setCat] = useState("Все");

  const catOptions = useMemo(() => ["Все", ...categories.map((c) => c.name)], [categories]);
  const catIdByName = useMemo(() => new Map(categories.map((c) => [c.name, c.id])), [categories]);

  const shown = useMemo(() => {
    if (cat === "Все") return items;
    const id = catIdByName.get(cat);
    return items.filter((i) => i.categoryId === id);
  }, [items, cat, catIdByName]);

  return (
    <div className="flex flex-col h-full">
      {catOptions.length > 1 && (
        <div className="overflow-x-auto pb-3 -mx-1 px-1 font-app-text">
          <SegmentedControl size="cash" value={cat} onChange={setCat} options={catOptions.map((c) => ({ value: c, label: c }))} />
        </div>
      )}
      <div className="flex-1 overflow-y-auto -mx-1 px-1">
        {shown.length > 0 ? (
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
            {shown.map((item) => (
              <button
                key={item.id}
                onClick={() => onPick(item)}
                className="relative text-left min-h-[92px] p-3 rounded-tag border border-line bg-paper-2 hover:border-ink active:scale-[0.98] transition flex flex-col justify-between font-app-text"
              >
                <span className="font-medium leading-tight text-base line-clamp-3">{item.name}</span>
                <span className="flex items-baseline justify-between mt-2">
                  <span className="font-app-mono font-semibold tabular-nums">{money0(item.price)}</span>
                  {item.modifierGroups.length > 0 && <span className="text-[10px] text-ink-soft uppercase">выбор</span>}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-ink-soft text-center py-10 px-6 leading-relaxed font-app-text text-base">
            В этой категории пока нет блюд.
          </p>
        )}
      </div>
    </div>
  );
}
