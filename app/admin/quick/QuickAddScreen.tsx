"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button, SegmentedControl, EmptyState, ConfirmDialog } from "@/components/ui";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { isValidBarcode } from "@/lib/ean13";
import { parseRuNumber, money0 } from "@/lib/format";
import { lookupBarcodesAction, saveQuickRowsAction } from "./actions";
import type { QuickSaveResult } from "@/server/services/quickAdd";

// Строка черновика. Живёт в localStorage до явного сохранения в базу —
// продавец может набивать пачку весь день, закрывать вкладку и возвращаться.
type Row = {
  key: string;
  barcode: string;
  price: number;
  name: string;
  category: string;
  costPrice: number;
  unit: "PCS" | "KG";
  stock: number;
  // Статус распознавания: чтобы после «Сканирования ИИ» было видно, что нашли,
  // а что нужно дописать руками.
  // guess — ИИ восстановил название по бренду/производителю, точного совпадения
  // не нашёл. Такие обязательно нужно проверить глазами, поэтому отдельный вид.
  status: "new" | "found" | "guess" | "notfound" | "exists";
  note?: string;
  // Другие написания того же товара из справочников — выбираются одним тапом.
  alternatives?: string[];
  // Названия из двух справочников совпали по смыслу.
  verified?: boolean;
  // Штрихкод найден в двух независимых справочниках.
  inTwoSources?: boolean;
};

const STORAGE_PREFIX = "torgos:quickadd:";
let seq = 0;
const nextKey = () => `r${Date.now().toString(36)}${++seq}`;

// Себестоимость по умолчанию — та же формула, что в ручной форме товара
// (цена минус её пятая часть), чтобы наценка считалась осмысленно сразу.
const defaultCost = (price: number) => (price > 0 ? Math.round((price - price / 5) * 100) / 100 : 0);

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

// Черновик лежит в localStorage — его мог испортить старый формат, ручная
// правка через DevTools или обрыв записи. Всё, что оттуда приходит, приводим
// к валидной строке, иначе экран падал бы на NaN в расчёте наценки.
function sanitizeRow(raw: unknown): Row | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const barcode = String(r.barcode ?? "").trim();
  if (!barcode) return null;
  const KNOWN_STATUSES = ["found", "guess", "notfound", "exists"] as const;
  const status = (KNOWN_STATUSES as readonly string[]).includes(String(r.status))
    ? (r.status as Row["status"])
    : "new";
  return {
    key: typeof r.key === "string" && r.key ? r.key : nextKey(),
    barcode,
    price: num(r.price),
    name: String(r.name ?? ""),
    category: String(r.category ?? ""),
    costPrice: num(r.costPrice),
    unit: r.unit === "KG" ? "KG" : "PCS",
    stock: num(r.stock),
    status,
    note: typeof r.note === "string" ? r.note : undefined,
    alternatives: Array.isArray(r.alternatives) ? r.alternatives.filter((x): x is string => typeof x === "string").slice(0, 4) : [],
    verified: r.verified === true,
    inTwoSources: r.inTwoSources === true,
  };
}

export function QuickAddScreen({ storeId }: { storeId: string }) {
  const storageKey = STORAGE_PREFIX + storeId;
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [price, setPrice] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<QuickSaveResult | null>(null);
  const [clearAsk, setClearAsk] = useState(false);
  const [looking, startLookup] = useTransition();
  const [saving, startSave] = useTransition();

  const barcodeRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  // Восстановление черновика. Читаем один раз на монтировании; до этого
  // ничего не пишем, иначе пустой первый рендер затрёт сохранённое.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setRows(parsed.map(sanitizeRow).filter((r): r is Row => r !== null));
      }
    } catch {
      // повреждённый черновик — не повод падать, начинаем с пустого списка
    }
    setLoaded(true);
  }, [storageKey]);

  useEffect(() => {
    if (!loaded) return;
    try {
      if (rows.length) localStorage.setItem(storageKey, JSON.stringify(rows));
      else localStorage.removeItem(storageKey);
    } catch {
      // приватный режим/переполнение — список просто не переживёт перезагрузку
    }
  }, [rows, loaded, storageKey]);

  const addRow = (code: string, priceStr: string) => {
    const clean = code.trim();
    const p = parseRuNumber(priceStr);
    if (!clean) { setInputError("Введите штрихкод"); barcodeRef.current?.focus(); return; }
    if (!isValidBarcode(clean)) { setInputError("Некорректный штрихкод: нужен EAN-13 (13 цифр) или EAN-8 (8 цифр)"); return; }
    if (!(p > 0)) { setInputError("Введите цену"); priceRef.current?.focus(); return; }
    // Дубль проверяем по текущему состоянию, а не внутри setRows: колбэк
    // обновления выполняется позже, и флаг из него читать уже поздно.
    if (rows.some((r) => r.barcode === clean)) {
      setInputError("Этот штрихкод уже есть в списке");
      return;
    }
    setRows((prev) => [...prev, {
      key: nextKey(), barcode: clean, price: p, name: "", category: "",
      costPrice: defaultCost(p), unit: "PCS", stock: 0, status: "new",
    }]);
    setInputError(null);
    setBarcode("");
    setPrice("");
    barcodeRef.current?.focus();
  };

  const patch = (key: string, p: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));

  // «Сканирование ИИ» — дозаполняем только те строки, где названия ещё нет.
  // Уже поправленные руками не трогаем: правка человека всегда главнее.
  const pending = rows.filter((r) => !r.name.trim());
  const runLookup = () => {
    if (!pending.length) return;
    setError(null);
    setDone(null);
    startLookup(async () => {
      const res = await lookupBarcodesAction(pending.map((r) => r.barcode));
      if (!res.ok) { setError(res.error); return; }
      const byCode = new Map(res.results.map((r) => [r.barcode, r]));
      setRows((prev) =>
        prev.map((r) => {
          const found = byCode.get(r.barcode);
          if (!found || r.name.trim()) return r;
          if (found.found) {
            // Найденное ТОЛЬКО ИИ-поиском всегда просим проверить: справочник —
            // это данные, а ответ модели — предположение. Живой прогон поймал
            // уверенно неверное название на импортном штрихкоде.
            const status = found.known
              ? "exists"
              : found.source === "web" || found.confidence !== "high"
                ? "guess"
                : "found";
            return {
              ...r,
              name: found.name,
              category: found.category,
              // Справочник знает, штучный товар или весовой — подставляем.
              unit: found.unit ?? r.unit,
              alternatives: found.alternatives ?? [],
              verified: found.verified ?? false,
              inTwoSources: found.inTwoSources ?? false,
              status,
              note: found.known
                ? "уже есть в базе — сохранить не выйдет"
                : status === "guess"
                  ? (found.source === "web"
                      ? "нашёл ИИ в интернете — сверьте с упаковкой"
                      : "ИИ не уверен — проверьте название")
                  : undefined,
            };
          }
          return { ...r, status: "notfound", note: found.error };
        }),
      );
    });
  };

  // Готова к сохранению строка с названием и ненулевой ценой. Цену можно
  // обнулить руками уже после добавления — товар за 0 ₽ в кассе бесполезен, а
  // молча сохранять такое хуже, чем показать причину.
  const readyToSave = rows.filter((r) => r.name.trim() && r.price > 0 && r.status !== "exists");
  const zeroPriced = rows.filter((r) => r.name.trim() && r.price <= 0 && r.status !== "exists").length;
  const alreadyInBase = rows.filter((r) => r.status === "exists").length;
  const save = () => {
    if (!readyToSave.length) return;
    setError(null);
    startSave(async () => {
      const res = await saveQuickRowsAction(
        readyToSave.map((r) => ({
          barcode: r.barcode, name: r.name, category: r.category || "Прочее",
          price: r.price, costPrice: r.costPrice, unit: r.unit, stock: r.stock,
        })),
      );
      if (!res.ok) { setError(res.error); return; }
      setDone(res.result);
      // Сохранённые уходят из списка, непрошедшие остаются с пометкой ошибки,
      // чтобы их можно было починить и сохранить ещё раз.
      const failedByCode = new Map(res.result.failed.map((f) => [f.barcode, f.error]));
      setRows((prev) =>
        prev
          .filter((r) => !r.name.trim() || failedByCode.has(r.barcode))
          .map((r) => (failedByCode.has(r.barcode) ? { ...r, status: "notfound", note: failedByCode.get(r.barcode) } : r)),
      );
    });
  };

  const notFoundCount = rows.filter((r) => r.status === "notfound" && !r.name.trim()).length;

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold mb-1">Быстрое добавление</h1>
      <p className="text-sm text-ink-soft mb-4">
        Сканируйте штрихкод и ставьте цену — товары копятся списком и <b>не попадают в базу сразу</b>.
        Когда всё набьёте, нажмите «Сканирование ИИ» — он найдёт названия и категории в интернете.
        Список хранится в этом браузере, его не потерять при перезагрузке.
      </p>

      {/* Ввод: штрихкод + цена. Сканер-пистолет шлёт Enter — по нему прыгаем
          в цену, по второму Enter строка уходит в список и фокус возвращается. */}
      <div className="bg-paper-2 border border-line rounded-tag p-3 mb-4">
        {/* На телефоне штрихкод занимает всю ширину (это главное поле), а цена
            и кнопки делят строку под ним — иначе каждая кнопка вставала бы в
            отдельный ряд и форма не помещалась на экран. */}
        <div className="flex flex-wrap items-end gap-2">
          <label className="block w-full sm:flex-1 sm:min-w-[200px]">
            <span className="text-sm text-ink-soft">Штрихкод</span>
            <input
              ref={barcodeRef}
              value={barcode}
              autoFocus
              inputMode="numeric"
              placeholder="сканируйте или введите"
              onChange={(e) => { setBarcode(e.target.value.replace(/[^\d]/g, "")); setInputError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); priceRef.current?.focus(); } }}
              className="w-full min-w-0 h-12 px-3 bg-paper border border-line rounded-tag font-app-mono text-lg focus:border-ink"
            />
          </label>
          <label className="block w-24 sm:w-32 shrink-0">
            <span className="text-sm text-ink-soft">Цена, ₽</span>
            <input
              ref={priceRef}
              value={price}
              inputMode="decimal"
              onChange={(e) => { setPrice(e.target.value.replace(/[^\d.,]/g, "")); setInputError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRow(barcode, price); } }}
              className="w-full min-w-0 h-12 px-3 bg-paper border border-line rounded-tag font-app-mono text-lg focus:border-ink"
            />
          </label>
          <Button variant="line" size="lg" className="shrink-0" onClick={() => setScannerOpen(true)}>Камера</Button>
          <Button variant="stamp" size="lg" className="flex-1 sm:flex-none" onClick={() => addRow(barcode, price)}>
            <span className="sm:hidden">Добавить</span>
            <span className="hidden sm:inline">Добавить в список</span>
          </Button>
        </div>
        {inputError && <p className="text-stamp-text text-sm mt-2">{inputError}</p>}
      </div>

      {error && <p className="text-stamp-text text-sm mb-4">{error}</p>}

      {rows.length === 0 ? (
        <EmptyState>Список пуст. Отсканируйте первый товар — он появится здесь.</EmptyState>
      ) : (
        <>
          {/* На телефоне кнопки идут сеткой 2×2 вместо колонки в четыре ряда:
              «Сохранить» на всю ширину, как главное действие. */}
          <div className="grid grid-cols-2 gap-2 mb-2 sm:flex sm:flex-wrap sm:items-center">
            <h2 className="font-semibold col-span-2 sm:mr-auto">
              В списке: {rows.length}
              {pending.length > 0 && <span className="text-ink-soft font-normal"> · без названия: {pending.length}</span>}
            </h2>
            <Button variant="ghost" onClick={() => setClearAsk(true)}>Очистить</Button>
            <Button variant="line" onClick={runLookup} disabled={looking || pending.length === 0}>
              {looking ? `ИИ ищет… (${pending.length})` : `✨ Сканирование ИИ (${pending.length})`}
            </Button>
            <Button variant="stamp" className="col-span-2 sm:col-span-1" onClick={save} disabled={saving || readyToSave.length === 0}>
              {saving ? "Сохраняем…" : `Сохранить в базу (${readyToSave.length})`}
            </Button>
          </div>

          {notFoundCount > 0 && (
            <p className="text-sm text-warn-text mb-2">
              {notFoundCount} шт. ИИ не нашёл в интернете — впишите название руками, и они тоже сохранятся.
            </p>
          )}
          {zeroPriced > 0 && (
            <p className="text-sm text-warn-text mb-2">
              {zeroPriced} шт. с нулевой ценой — такие не сохранятся, проставьте цену.
            </p>
          )}
          {alreadyInBase > 0 && (
            <p className="text-sm text-warn-text mb-2">
              {alreadyInBase} шт. уже есть в базе — их не сохранить повторно. Уберите из списка,
              а цену поменяйте в разделе «Товары».
            </p>
          )}

          <div className="space-y-2">
            {rows.map((r) => (
              <div
                key={r.key}
                className={`border rounded-tag p-3 ${
                  r.status === "exists" || r.status === "guess" || (r.status === "notfound" && !r.name.trim())
                    ? "border-warn bg-warn/5"
                    : "border-line bg-paper-2"
                }`}
              >
                {/* flex-wrap + min-w-0: пометки бывают длинными («Внутренний код
                    магазина — впишите название сами»), и на узком экране такая
                    строка распирала страницу до горизонтальной прокрутки. */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
                  <span className="font-app-mono text-xs text-ink-soft shrink-0">{r.barcode}</span>
                  {r.status === "found" && (
                    <span className="text-xs text-fresh-text min-w-0">
                      {r.verified
                        ? "название совпало в 2 справочниках"
                        : r.inTwoSources
                          ? "есть в 2 справочниках"
                          : "нашёл ИИ"}
                    </span>
                  )}
                  {r.status === "guess" && <span className="text-xs text-warn-text min-w-0">{r.note ?? "ИИ не уверен"}</span>}
                  {r.status === "exists" && <span className="text-xs text-warn-text min-w-0">{r.note ?? "уже есть в базе"}</span>}
                  {r.status === "notfound" && <span className="text-xs text-warn-text min-w-0">{r.note ?? "не найден"}</span>}
                  <button onClick={() => removeRow(r.key)} className="text-xs text-ink-soft hover:text-stamp-text px-2 ml-auto shrink-0">
                    убрать
                  </button>
                </div>
                <input
                  value={r.name}
                  onChange={(e) => patch(r.key, { name: e.target.value })}
                  placeholder="Название — заполнит ИИ или впишите сами"
                  className="w-full h-10 px-2 mb-2 bg-paper border border-line rounded-tag font-medium focus:border-ink"
                />
                {/* Справочники обычно знают несколько написаний одного товара.
                    Показываем их: нажать нужное быстрее и надёжнее, чем
                    вычитывать и править одно навязанное название. */}
                {(r.alternatives?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <span className="text-xs text-ink-soft self-center">ещё варианты:</span>
                    {r.alternatives!.map((alt) => (
                      <button
                        key={alt}
                        type="button"
                        onClick={() => patch(r.key, { name: alt })}
                        className="text-xs px-2 py-1 rounded-tag border border-line bg-paper hover:border-ink text-left"
                      >
                        {alt}
                      </button>
                    ))}
                  </div>
                )}
                {/* Телефон: категория на всю ширину, остальное сеткой 2×2.
                    sm:contents растворяет обёртку, и на планшете/десктопе все
                    пять полей встают в один ряд, как раньше. */}
                <div className="grid gap-2 sm:grid-cols-5">
                  <label className="block">
                    <span className="block text-xs text-ink-soft mb-0.5">Категория</span>
                    <input
                      value={r.category}
                      onChange={(e) => patch(r.key, { category: e.target.value })}
                      placeholder="Прочее"
                      className="w-full min-w-0 h-9 px-2 bg-paper border border-line rounded-tag text-sm focus:border-ink"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2 sm:contents">
                    <NumBox label="Цена, ₽" value={r.price} onChange={(v) => patch(r.key, { price: v })} />
                    <NumBox label="Себест., ₽" value={r.costPrice} onChange={(v) => patch(r.key, { costPrice: v })} />
                    <NumBox label="Остаток" value={r.stock} onChange={(v) => patch(r.key, { stock: v })} />
                    <div className="min-w-0">
                      <span className="block text-xs text-ink-soft mb-0.5">Единица</span>
                      <SegmentedControl
                        fill
                        value={r.unit}
                        onChange={(u) => patch(r.key, { unit: u })}
                        options={[{ value: "PCS" as const, label: "шт" }, { value: "KG" as const, label: "кг" }]}
                      />
                    </div>
                  </div>
                </div>
                {r.price > 0 && r.costPrice > 0 && (
                  <p className="text-xs text-ink-soft mt-1.5">
                    наценка {Math.round(((r.price - r.costPrice) / r.price) * 100)}% · прибыль {money0(r.price - r.costPrice)} ₽
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {done && (
        <div className="border-2 border-fresh bg-fresh/10 rounded-tag p-4 mt-4">
          <h2 className="font-semibold text-fresh-text mb-1">✓ Сохранено: {done.created.length}</h2>
          {done.failed.length > 0 && (
            <p className="text-sm text-stamp-text mb-2">
              Не сохранилось {done.failed.length} — они остались в списке с пометкой причины.
            </p>
          )}
          <ul className="space-y-1 text-sm">
            {done.created.map((c) => (
              <li key={c.barcode} className="flex items-baseline gap-2">
                <span className="font-app-mono text-xs text-ink-soft">{c.barcode}</span>
                <Link href={`/admin?q=${encodeURIComponent(c.name)}`} className="underline underline-offset-2 hover:text-stamp-text">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/admin" className="inline-block mt-3 text-sm text-stamp-text underline underline-offset-2">
            Открыть товары для проверки →
          </Link>
        </div>
      )}

      {scannerOpen && (
        <BarcodeScanner
          onScan={(code) => {
            setScannerOpen(false);
            setBarcode(code);
            setInputError(null);
            priceRef.current?.focus();
          }}
          onClose={() => setScannerOpen(false)}
        />
      )}

      <ConfirmDialog
        open={clearAsk}
        title="Очистить весь список?"
        body="Набранные позиции удалятся из черновика. В базе они не сохранены."
        confirmLabel="Очистить"
        onConfirm={() => { setRows([]); setClearAsk(false); setDone(null); }}
        onCancel={() => setClearAsk(false)}
      />
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
        className="w-full h-9 px-2 bg-paper border border-line rounded-tag font-app-mono text-sm focus:border-ink"
      />
    </label>
  );
}
