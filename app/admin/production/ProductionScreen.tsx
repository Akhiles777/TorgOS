"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, EmptyState, Badge, DecimalField } from "@/components/ui";
import { money0, qty, unitLabel } from "@/lib/format";
import type { SemiFinishedRow, ProductionDocRow, ProductionPreview } from "@/server/services/horeca/production";
import { previewProductionAction, runProductionAction } from "./actions";

export function ProductionScreen({ semiFinished, docs }: { semiFinished: SemiFinishedRow[]; docs: ProductionDocRow[] }) {
  const router = useRouter();
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [comment, setComment] = useState("");
  const [preview, setPreview] = useState<ProductionPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, startPreview] = useTransition();
  const [running, startRun] = useTransition();
  const [runError, setRunError] = useState<string | null>(null);

  const selected = semiFinished.find((p) => p.id === productId) ?? null;
  const qtyNum = parseFloat(quantity.replace(",", ".")) || 0;

  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
    if (!productId || qtyNum <= 0) return;
    const t = setTimeout(() => {
      startPreview(async () => {
        const res = await previewProductionAction(productId, qtyNum);
        if (res.ok) setPreview(res.preview);
        else setPreviewError(res.error);
      });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, qtyNum]);

  const runProduction = () => {
    if (!productId || qtyNum <= 0) return;
    startRun(async () => {
      const res = await runProductionAction(productId, qtyNum, comment);
      if (res.ok) {
        setProductId(""); setQuantity(""); setComment(""); setPreview(null);
        router.refresh();
      } else {
        setRunError(res.error);
      }
    });
  };

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Производство</h1>

      {semiFinished.length === 0 ? (
        <EmptyState className="mb-6">
          Полуфабрикатов с рецептом пока нет — отметьте товар полуфабрикатом и задайте рецепт на вкладке «Рецепты».
        </EmptyState>
      ) : (
        <div className="bg-paper-2 border border-line rounded-tag p-4 mb-6 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-sm text-ink-soft mb-1">Полуфабрикат</span>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full h-11 px-3 bg-paper border border-line rounded-tag focus:border-ink"
              >
                <option value="">Выберите…</option>
                {semiFinished.map((p) => <option key={p.id} value={p.id}>{p.name} · остаток {qty(p.stock, p.unit)} {unitLabel(p.unit)}</option>)}
              </select>
            </label>
            <DecimalField
              label={selected ? `Количество, ${unitLabel(selected.unit)}` : "Количество"}
              value={quantity}
              onValueChange={setQuantity}
              placeholder="0"
            />
          </div>

          {previewing && <p className="text-sm text-ink-soft">Считаю…</p>}
          {previewError && <p className="text-sm text-stamp-text">{previewError}</p>}

          {preview && (
            <div className="border border-line rounded-tag overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-paper text-ink-soft text-left">
                    <th className="px-3 py-2 font-medium">Ингредиент</th>
                    <th className="px-3 py-2 font-medium text-right">Нужно</th>
                    <th className="px-3 py-2 font-medium text-right">Есть</th>
                    <th className="px-3 py-2 font-medium text-right">Останется</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.lines.map((l) => (
                    <tr key={l.productId} className={`border-t border-line ${!l.enough ? "bg-stamp/5" : ""}`}>
                      <td className="px-3 py-2">{l.name}{!l.enough && <Badge tone="stamp">не хватает</Badge>}</td>
                      <td className="px-3 py-2 text-right font-app-mono">{qty(l.needed, l.unit)} {unitLabel(l.unit)}</td>
                      <td className="px-3 py-2 text-right font-app-mono text-ink-soft">{qty(l.available, l.unit)} {unitLabel(l.unit)}</td>
                      <td className={`px-3 py-2 text-right font-app-mono ${l.remaining < 0 ? "text-stamp-text font-semibold" : ""}`}>
                        {qty(l.remaining, l.unit)} {unitLabel(l.unit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line bg-paper font-medium">
                    <td className="px-3 py-2" colSpan={3}>Себестоимость {selected ? unitLabel(selected.unit) : "ед."}</td>
                    <td className="px-3 py-2 text-right font-app-mono">{money0(preview.unitCost)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <label className="block">
            <span className="block text-sm text-ink-soft mb-1">Комментарий (необязательно)</span>
            <input value={comment} onChange={(e) => setComment(e.target.value)} className="w-full h-11 px-3 bg-paper border border-line rounded-tag focus:border-ink" />
          </label>

          {runError && <p className="text-sm text-stamp-text">{runError}</p>}
          <Button
            variant="stamp"
            size="lg"
            onClick={runProduction}
            disabled={!preview || !preview.allEnough || running}
          >
            {running ? "Проводим…" : "Провести"}
          </Button>
          {preview && !preview.allEnough && <p className="text-xs text-ink-soft">Не хватает сырья — проведение заблокировано, пополните остаток.</p>}
        </div>
      )}

      <h2 className="text-lg font-semibold mb-3">История</h2>
      {docs.length === 0 ? (
        <EmptyState>Производства ещё не было.</EmptyState>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <details key={d.id} className="border border-line rounded-tag bg-paper-2 px-3 py-2.5">
              <summary className="cursor-pointer flex items-center justify-between gap-2">
                <span className="font-medium">№{d.number} · {d.productName} · {qty(d.quantity, d.productUnit)} {unitLabel(d.productUnit)}</span>
                <span className="text-ink-soft text-sm font-app-mono">{money0(d.totalCost)} ₽</span>
              </summary>
              <div className="mt-2 pt-2 border-t border-line text-sm text-ink-soft space-y-1">
                <p>{new Date(d.createdAt).toLocaleString("ru-RU")} · {d.userName}</p>
                {d.comment && <p>«{d.comment}»</p>}
                <ul className="mt-1">
                  {d.lines.map((l, i) => (
                    <li key={i}>— {l.productName}: {qty(l.quantity, l.unit)} {unitLabel(l.unit)}</li>
                  ))}
                </ul>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
