"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { Button, Card, EmptyState, ConfirmDialog, Modal } from "@/components/ui";
import { qty, unitLabel } from "@/lib/format";
import {
  startSessionAction, scanItemAction, addManualLineAction, setLineCountAction, removeLineAction, cancelSessionAction, finishSessionAction,
} from "./actions";
import type { InventorySessionRow, InventoryLineRow } from "@/server/services/inventory";
import type { Unit } from "@prisma/client";

type ProductRef = { id: string; name: string; unit: Unit; category: string; barcode: string | null };
type WeightPrompt = { source: "scan"; barcode: string; name: string } | { source: "manual"; productId: string; name: string };
type Flash = { kind: "add" | "error"; text: string } | null;

export function InventoryScreen({ initialSession, products }: { initialSession: InventorySessionRow | null; products: ProductRef[] }) {
  const router = useRouter();
  const session = initialSession;

  const [starting, setStarting] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);
  const [weightPrompt, setWeightPrompt] = useState<WeightPrompt | null>(null);
  const [weightValue, setWeightValue] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ applied: number; unchanged: number } | null>(null);

  const showFlash = (f: NonNullable<Flash>) => {
    setFlash(f);
    setTimeout(() => setFlash(null), 1800);
  };

  const start = async () => {
    setStarting(true);
    const res = await startSessionAction();
    setStarting(false);
    if (res.ok) router.refresh();
    else showFlash({ kind: "error", text: res.error });
  };

  // Скан: сначала узнаём unit (штрихкод веса не несёт), развесным — отдельный
  // шаг с вводом веса, штучным — сразу +1.
  const handleScan = async (code: string) => {
    const lookupRes = await fetch(`/api/admin/lookup?barcode=${encodeURIComponent(code)}`);
    const data = await lookupRes.json();
    if (!data.product) {
      showFlash({ kind: "error", text: `Штрихкод ${code} не найден` });
      return;
    }
    if (data.product.unit === "KG") {
      setWeightPrompt({ source: "scan", barcode: code, name: data.product.name });
      return;
    }
    if (!session) return;
    const res = await scanItemAction(session.id, code);
    if (!res.ok) {
      showFlash({ kind: "error", text: res.error });
      return;
    }
    if ("notFound" in res.outcome) {
      showFlash({ kind: "error", text: `Штрихкод ${code} не найден` });
      return;
    }
    showFlash({ kind: "add", text: `${res.outcome.productName} · факт ${qty(res.outcome.line.countedQty, "PCS")} шт` });
    router.refresh();
  };

  const confirmWeight = async () => {
    if (!weightPrompt || !session) return;
    const kg = parseFloat(weightValue.replace(",", ".")) || 0;
    if (kg <= 0) return;
    const res =
      weightPrompt.source === "scan"
        ? await scanItemAction(session.id, weightPrompt.barcode, kg)
        : await addManualLineAction(session.id, weightPrompt.productId, kg);
    setWeightPrompt(null);
    setWeightValue("");
    if (!res.ok) {
      showFlash({ kind: "error", text: res.error });
      return;
    }
    if ("notFound" in res.outcome) {
      showFlash({ kind: "error", text: "Товар не найден" });
      return;
    }
    showFlash({ kind: "add", text: `${res.outcome.productName} · факт ${qty(res.outcome.line.countedQty, "KG")} кг` });
    router.refresh();
  };

  const pickManual = async (p: ProductRef) => {
    if (!session) return;
    if (p.unit === "KG") {
      setManualOpen(false);
      setWeightPrompt({ source: "manual", productId: p.id, name: p.name });
      return;
    }
    const res = await addManualLineAction(session.id, p.id);
    if (!res.ok) {
      showFlash({ kind: "error", text: res.error });
      return;
    }
    if ("notFound" in res.outcome) return;
    setManualOpen(false);
    setManualQuery("");
    showFlash({ kind: "add", text: `${res.outcome.productName} · факт ${qty(res.outcome.line.countedQty, "PCS")} шт` });
    router.refresh();
  };

  const adjustLine = async (line: InventoryLineRow, next: number) => {
    if (next < 0) return;
    const res = await setLineCountAction(line.id, next);
    if (!res.ok) showFlash({ kind: "error", text: res.error });
    router.refresh();
  };

  const removeLineRow = async (lineId: string, name: string) => {
    const res = await removeLineAction(lineId);
    if (!res.ok) showFlash({ kind: "error", text: res.error });
    else showFlash({ kind: "error", text: `${name} убран из подсчёта` });
    router.refresh();
  };

  const doCancel = async () => {
    if (!session) return;
    setConfirmCancel(false);
    setBusy(true);
    const res = await cancelSessionAction(session.id);
    setBusy(false);
    if (!res.ok) showFlash({ kind: "error", text: res.error });
    router.refresh();
  };

  const doFinish = async () => {
    if (!session) return;
    setConfirmFinish(false);
    setBusy(true);
    const res = await finishSessionAction(session.id);
    setBusy(false);
    if (!res.ok) {
      showFlash({ kind: "error", text: res.error });
      return;
    }
    setSummary({ applied: res.applied, unchanged: res.unchanged });
    router.refresh();
  };

  const manualMatches = manualQuery.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(manualQuery.trim().toLowerCase())).slice(0, 20)
    : [];

  if (summary) {
    return (
      <div className="max-w-lg">
        <Card>
          <h1 className="text-xl font-semibold mb-1">Инвентаризация применена</h1>
          <p className="text-ink-soft text-sm mb-4">
            Изменено позиций: {summary.applied}. Без расхождений: {summary.unchanged}.
          </p>
          <Button variant="stamp" onClick={() => setSummary(null)}>Готово</Button>
        </Card>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-lg">
        <Card>
          <h1 className="text-xl font-semibold mb-1">Инвентаризация</h1>
          <p className="text-ink-soft text-sm mb-4">
            Сканируйте товар за товаром — система сама сверяет с тем, что должно быть по базе. В конце —
            список расхождений и кнопка «Применить», которая спишет недостачи и оприходует излишки.
          </p>
          <Button variant="stamp" size="lg" onClick={start} disabled={starting}>
            {starting ? "Начинаем…" : "Начать инвентаризацию"}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-2 mb-4">
        <h1 className="text-xl font-semibold mr-auto">Инвентаризация</h1>
        <span className="text-xs text-ink-soft">начал {session.startedByName}</span>
      </div>

      <div className="flex gap-2 mb-4">
        <Button variant="stamp" size="lg" onClick={() => setScannerOpen(true)}>Сканировать</Button>
        <Button variant="line" size="lg" onClick={() => setManualOpen(true)}>Без штрихкода</Button>
      </div>

      {session.lines.length === 0 ? (
        <EmptyState>Ещё ничего не отсканировано — начните с любого товара.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {session.lines.map((l) => {
            const delta = Math.round((l.countedQty - l.expectedQty) * 1000) / 1000;
            return (
              <li key={l.id} className="border border-line rounded-tag bg-paper-2 p-3">
                <div className="flex items-baseline">
                  <span className="font-medium">{l.name}</span>
                  <span className="leader" aria-hidden />
                  <span className={`font-app-mono font-semibold ${delta === 0 ? "" : delta > 0 ? "text-fresh-text" : "text-stamp-text"}`}>
                    {qty(l.countedQty, l.unit)} {unitLabel(l.unit)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1.5 gap-2">
                  <span className="text-xs text-ink-soft">
                    по базе {qty(l.expectedQty, l.unit)} {unitLabel(l.unit)}
                    {delta !== 0 && ` · ${delta > 0 ? "излишек" : "недостача"} ${qty(Math.abs(delta), l.unit)} ${unitLabel(l.unit)}`}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {l.unit === "PCS" ? (
                      <>
                        <button onClick={() => adjustLine(l, l.countedQty - 1)} className="w-9 h-9 grid place-items-center rounded-tag border border-line hover:bg-paper" aria-label="Меньше">
                          −
                        </button>
                        <button onClick={() => adjustLine(l, l.countedQty + 1)} className="w-9 h-9 grid place-items-center rounded-tag border border-line hover:bg-paper" aria-label="Больше">
                          +
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setWeightPrompt({ source: "manual", productId: l.productId, name: l.name })}
                        className="h-9 px-3 rounded-tag border border-line text-sm hover:bg-paper"
                      >
                        Изменить
                      </button>
                    )}
                    <button onClick={() => removeLineRow(l.id, l.name)} className="h-9 px-2 text-ink-soft hover:text-stamp-text text-xs" aria-label={`Убрать ${l.name}`}>
                      убрать
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-3 mt-6">
        <Button variant="line" size="lg" onClick={() => setConfirmCancel(true)} disabled={busy}>
          Отменить
        </Button>
        <Button variant="stamp" size="lg" onClick={() => setConfirmFinish(true)} disabled={busy || session.lines.length === 0}>
          Завершить и применить
        </Button>
      </div>

      {scannerOpen && <BarcodeScanner onScan={handleScan} onClose={() => setScannerOpen(false)} />}

      {weightPrompt && (
        <Modal onCancel={() => { setWeightPrompt(null); setWeightValue(""); }}>
          <div className="w-[min(92vw,380px)]">
            <p className="text-ink-soft text-sm">Развесной товар</p>
            <h2 className="text-xl font-semibold mt-1 mb-4">{weightPrompt.name}</h2>
            <input
              autoFocus
              inputMode="decimal"
              value={weightValue}
              onChange={(e) => setWeightValue(e.target.value.replace(/[^\d.,]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && confirmWeight()}
              placeholder="0,000"
              className="w-full h-16 px-4 text-4xl font-app-mono tabular-nums text-center bg-paper border-2 border-line rounded-tag focus:border-ink"
            />
            <div className="grid grid-cols-2 gap-3 mt-5">
              <Button variant="line" size="lg" onClick={() => { setWeightPrompt(null); setWeightValue(""); }}>
                Отмена
              </Button>
              <Button variant="fresh" size="lg" onClick={confirmWeight}>
                Записать
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {manualOpen && (
        <Modal onCancel={() => setManualOpen(false)}>
          <div className="w-[min(92vw,420px)]">
            <h2 className="text-xl font-semibold mb-3">Добавить без сканирования</h2>
            <input
              autoFocus
              value={manualQuery}
              onChange={(e) => setManualQuery(e.target.value)}
              placeholder="Название товара…"
              className="w-full h-11 px-3 bg-paper border border-line rounded-tag focus:border-ink"
            />
            <div className="mt-3 max-h-72 overflow-y-auto space-y-1.5">
              {manualQuery.trim() && manualMatches.length === 0 && <p className="text-ink-soft text-sm py-4 text-center">Ничего не нашлось.</p>}
              {manualMatches.map((p) => (
                <button
                  key={p.id}
                  onClick={() => pickManual(p)}
                  className="w-full text-left h-12 px-3 rounded-tag border border-line hover:bg-paper-2 flex items-center justify-between gap-2"
                >
                  <span className="truncate">{p.name}</span>
                  <span className="text-xs text-ink-soft shrink-0">{p.category}</span>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {flash && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-40 px-5 py-3 rounded-tag border-2 font-medium shadow-lg ${
            flash.kind === "add" ? "bg-fresh text-stamp-ink border-fresh" : "bg-stamp text-stamp-ink border-stamp"
          }`}
          role="status"
        >
          {flash.text}
        </div>
      )}

      <ConfirmDialog
        open={confirmCancel}
        title="Отменить инвентаризацию?"
        body="Всё отсканированное пропадёт, остатки товаров не изменятся."
        confirmLabel="Отменить"
        onConfirm={doCancel}
        onCancel={() => setConfirmCancel(false)}
      />
      <ConfirmDialog
        open={confirmFinish}
        title="Применить результаты?"
        body="Остатки товаров станут равны тому, что посчитано. По каждому расхождению запишется приход или списание."
        confirmLabel="Применить"
        danger={false}
        onConfirm={doFinish}
        onCancel={() => setConfirmFinish(false)}
      />
    </div>
  );
}
