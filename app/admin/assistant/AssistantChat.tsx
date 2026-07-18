"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { money0, qty, unitLabel } from "@/lib/format";
import { parseIntakeAction, applyIntakeAction, type ApplyResult } from "./actions";
import type { IntakeItem } from "@/server/ai/product-intake";

export function AssistantChat({ userName }: { userName: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [items, setItems] = useState<IntakeItem[] | null>(null);
  const [done, setDone] = useState<Extract<ApplyResult, { ok: true }>["items"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsing, startParse] = useTransition();
  const [applying, startApply] = useTransition();

  const parse = () => {
    setError(null);
    setDone(null);
    startParse(async () => {
      const res = await parseIntakeAction(text);
      if (res.ok) setItems(res.items);
      else setError(res.error);
    });
  };

  const apply = () => {
    if (!items) return;
    setError(null);
    startApply(async () => {
      const res = await applyIntakeAction(items, userName);
      if (res.ok) {
        setDone(res.items);
        setItems(null);
        setText("");
        router.refresh();
      } else setError(res.error);
    });
  };

  const patch = (i: number, p: Partial<IntakeItem>) =>
    setItems((prev) => (prev ? prev.map((it, idx) => (idx === i ? { ...it, ...p } : it)) : prev));
  const removeItem = (i: number) => setItems((prev) => (prev ? prev.filter((_, idx) => idx !== i) : prev));

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-1">Приёмка через ИИ</h1>
      <p className="text-sm text-ink-soft mb-4">
        Опишите словами, что пришло — ИИ разложит на товары и количество. Перед сохранением всё можно
        проверить и поправить. Новые товары заведутся, знакомым — добавится приход.
      </p>

      {/* Ввод */}
      <div className="bg-paper-2 border border-line rounded-tag p-3 mb-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Например: пришло 20 бутылок Рычал-Су по 75, 5 кг сахара по 60 себестоимость 48, 10 самсы по 95"
          className="w-full px-3 py-2 bg-paper border border-line rounded-tag focus:border-ink resize-none"
        />
        <div className="flex justify-end mt-2">
          <Button variant="stamp" onClick={parse} disabled={parsing || text.trim().length < 3}>
            {parsing ? "ИИ разбирает…" : "Разобрать"}
          </Button>
        </div>
      </div>

      {error && <p className="text-stamp text-sm mb-4">{error}</p>}

      {/* Проверка перед сохранением */}
      {items && items.length > 0 && (
        <div className="mb-4">
          <h2 className="font-semibold mb-2">Проверьте перед сохранением ({items.length})</h2>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="border border-line rounded-tag bg-paper p-3">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    value={it.name}
                    onChange={(e) => patch(i, { name: e.target.value })}
                    className="flex-1 h-9 px-2 bg-paper border border-line rounded-tag font-medium focus:border-ink"
                  />
                  <button onClick={() => removeItem(i)} className="text-xs text-ink-soft hover:text-stamp px-2">убрать</button>
                </div>
                {it.matchedProductId ? (
                  <p className="text-xs text-fresh mb-2">приход к существующему товару</p>
                ) : (
                  <p className="text-xs text-ink-soft mb-2">новый товар · категория «{it.category}»</p>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <NumBox label={`Кол-во, ${unitLabel(it.unit)}`} value={it.quantity} onChange={(v) => patch(i, { quantity: v })} />
                  <div>
                    <span className="block text-xs text-ink-soft mb-0.5">Единица</span>
                    <div className="grid grid-cols-2 gap-1">
                      {(["PCS", "KG"] as const).map((u) => (
                        <button key={u} onClick={() => patch(i, { unit: u })} disabled={!!it.matchedProductId}
                          className={`h-9 rounded-tag border text-sm ${it.unit === u ? "bg-ink text-paper border-ink" : "bg-paper border-line"} disabled:opacity-50`}>
                          {u === "PCS" ? "шт" : "кг"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <NumBox label="Цена, ₽" value={it.price} onChange={(v) => patch(i, { price: v })} />
                  <NumBox label="Себест., ₽" value={it.costPrice} onChange={(v) => patch(i, { costPrice: v })} />
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-3">
            <Button variant="line" size="lg" onClick={() => setItems(null)}>Отмена</Button>
            <Button variant="stamp" size="lg" onClick={apply} disabled={applying}>
              {applying ? "Сохраняем…" : "Подтвердить и оприходовать"}
            </Button>
          </div>
        </div>
      )}

      {/* Результат с ссылками на проверку */}
      {done && done.length > 0 && (
        <div className="border-2 border-fresh bg-fresh/10 rounded-tag p-4">
          <h2 className="font-semibold text-fresh mb-1">✓ Оприходовано ({done.length})</h2>
          <p className="text-sm text-ink-soft mb-3">На всех экранах точки появилась рекомендация обновить страницу.</p>
          <ul className="space-y-1.5">
            {done.map((r) => (
              <li key={r.productId} className="flex items-baseline gap-2 text-sm">
                <span className="text-fresh">{r.action === "created" ? "новый" : "приход"}</span>
                <Link href={`/admin?q=${encodeURIComponent(r.name)}`} className="font-medium underline underline-offset-2 hover:text-stamp">
                  {r.name}
                </Link>
                <span className="text-ink-soft font-mono-nums">+{qty(r.quantity, r.unit)} {unitLabel(r.unit)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <Link href="/admin" className="text-sm text-stamp underline underline-offset-2">Открыть товары для проверки →</Link>
          </div>
        </div>
      )}
    </div>
  );
}

function NumBox({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="block text-xs text-ink-soft mb-0.5">{label}</span>
      <input
        inputMode="decimal"
        value={String(value)}
        onChange={(e) => {
          const n = parseFloat(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""));
          onChange(Number.isFinite(n) ? n : 0);
        }}
        className="w-full h-9 px-2 bg-paper border border-line rounded-tag font-mono-nums text-sm focus:border-ink"
      />
    </label>
  );
}
