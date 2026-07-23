"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { money0 } from "@/lib/format";
import type { PosProduct } from "./types";

// Ввод веса для развесного товара. Цена = вес × цена/кг, крупно.
export function WeightModal({
  product,
  onConfirm,
  onCancel,
}: {
  product: PosProduct;
  onConfirm: (kg: number) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const kg = parseFloat(value.replace(",", ".")) || 0;
  const sum = kg * product.price;
  const ok = kg > 0;

  const confirm = () => ok && onConfirm(Math.round(kg * 1000) / 1000);

  return (
    <Overlay onCancel={onCancel}>
      <div className="w-[min(92vw,420px)]">
        <p className="text-ink-soft text-sm">Развесной товар</p>
        <h2 className="text-2xl font-semibold mt-1 mb-4">{product.name}</h2>

        <label className="block text-sm text-ink-soft mb-1">Вес, кг</label>
        <input
          ref={ref}
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirm();
            if (e.key === "Escape") onCancel();
          }}
          placeholder="0,000"
          className="w-full h-16 px-4 text-4xl font-mono-nums tabular-nums text-center bg-paper border-2 border-line rounded-tag focus:border-ink"
        />

        <div className="mt-4 flex items-end justify-between bg-paper-2 rounded-tag px-4 py-3 border border-line">
          <span className="text-ink-soft">{money0(product.price)} ₽/кг</span>
          <span className="font-mono-nums font-bold text-3xl tabular-nums">{money0(sum)} ₽</span>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-5">
          <Button variant="line" size="lg" onClick={onCancel}>
            Отмена
          </Button>
          <Button variant="fresh" size="lg" onClick={confirm} disabled={!ok}>
            Добавить
          </Button>
        </div>
      </div>
    </Overlay>
  );
}

export function Overlay({ children, onCancel }: { children: React.ReactNode; onCancel: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-ink/40 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      {/* p-4 на мобиле, скролл — чтобы длинные формы не обрезались на низких экранах */}
      <div className="bg-paper rounded-tag border border-line shadow-2xl p-4 sm:p-6 my-auto max-h-[94dvh] overflow-y-auto">{children}</div>
    </div>
  );
}
