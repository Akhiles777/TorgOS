"use client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { Overlay } from "@/components/pos/WeightModal";
import { money0 } from "@/lib/format";
import type { PosMenuItem, PosModifier } from "@/server/services/horeca/pos";

// Открывается тапом по блюду с группами модификаторов — до добавления в
// заказ. Обязательные группы (isRequired) блокируют «Добавить», пока не
// выбрано; maxChoices ограничивает число вариантов в группе (1 = радио-выбор).
export function ModifierModal({
  item,
  onConfirm,
  onCancel,
}: {
  item: PosMenuItem;
  onConfirm: (selected: PosModifier[]) => void;
  onCancel: () => void;
}) {
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string[]>>({});

  const toggle = (groupId: string, modifierId: string, maxChoices: number) => {
    setSelectedByGroup((prev) => {
      const current = prev[groupId] ?? [];
      if (maxChoices === 1) {
        return { ...prev, [groupId]: current[0] === modifierId ? [] : [modifierId] };
      }
      if (current.includes(modifierId)) return { ...prev, [groupId]: current.filter((id) => id !== modifierId) };
      if (current.length >= maxChoices) return prev; // лимит группы достигнут
      return { ...prev, [groupId]: [...current, modifierId] };
    });
  };

  const selectedModifiers = useMemo(() => {
    const byId = new Map<string, PosModifier>();
    for (const g of item.modifierGroups) for (const m of g.modifiers) byId.set(m.id, m);
    return Object.values(selectedByGroup).flat().map((id) => byId.get(id)!).filter(Boolean);
  }, [selectedByGroup, item.modifierGroups]);

  const missingRequired = item.modifierGroups.filter((g) => g.isRequired && !(selectedByGroup[g.id]?.length));
  const canConfirm = missingRequired.length === 0;
  const total = item.price + selectedModifiers.reduce((s, m) => s + m.priceDelta, 0);

  return (
    <Overlay onCancel={onCancel}>
      <div className="w-[min(94vw,480px)] font-app-text">
        <h2 className="text-2xl font-semibold mb-4">{item.name}</h2>

        <div className="space-y-4 max-h-[55vh] overflow-y-auto -mx-1 px-1">
          {item.modifierGroups.map((g) => (
            <div key={g.id}>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="font-medium">{g.name}</span>
                {g.isRequired && <span className="text-xs text-stamp-text">обязательно</span>}
                {g.maxChoices > 1 && <span className="text-xs text-ink-soft">до {g.maxChoices}</span>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {g.modifiers.map((m) => {
                  const active = (selectedByGroup[g.id] ?? []).includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggle(g.id, m.id, g.maxChoices)}
                      className={`min-h-14 px-3 py-2 rounded-tag border-2 text-left transition ${
                        active ? "border-fresh bg-fresh/10 text-fresh-text" : "border-line bg-paper-2 hover:border-ink"
                      }`}
                    >
                      <span className="block font-medium text-sm">{m.name}</span>
                      {m.priceDelta !== 0 && (
                        <span className="block text-xs font-app-mono opacity-80">{m.priceDelta > 0 ? "+" : ""}{money0(m.priceDelta)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-end justify-between bg-paper-2 rounded-tag px-4 py-3 border border-line">
          <span className="text-ink-soft text-sm">Итого</span>
          <span className="font-app-mono font-bold text-3xl tabular-nums">{money0(total)} ₽</span>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-5">
          <Button variant="line" size="lg" onClick={onCancel}>Отмена</Button>
          <Button variant="fresh" size="lg" onClick={() => canConfirm && onConfirm(selectedModifiers)} disabled={!canConfirm}>
            Добавить
          </Button>
        </div>
      </div>
    </Overlay>
  );
}
