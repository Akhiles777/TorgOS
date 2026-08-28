"use client";
// Заведение товара прямо с кассы. Два сценария входа:
//  1) пробили штрихкод, которого нет в базе — модалка открывается сама с
//     подставленным кодом (покупатель ждёт, звать админа некогда);
//  2) кассир сам нажал «+ Товар» в шапке.
// В обоих случаях название можно не набивать руками — кнопка «Найти по ИИ»
// ищет товар по штрихкоду в интернете. Всё показанное правится до сохранения.
import { useEffect, useRef, useState } from "react";
import { Modal, SegmentedControl } from "@/components/ui";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { isValidBarcode } from "@/lib/ean13";
import { parseRuNumber } from "@/lib/format";
import { posLookupBarcodeAction, posCreateProductAction } from "@/app/pos/actions";
import type { PosProduct } from "./types";

const defaultCost = (price: number) => (price > 0 ? String(Math.round((price - price / 5) * 100) / 100) : "");

export function QuickProductModal({
  initialBarcode,
  onCreated,
  onCancel,
}: {
  initialBarcode: string;
  onCreated: (product: PosProduct, addToCart: boolean) => void;
  onCancel: () => void;
}) {
  const [barcode, setBarcode] = useState(initialBarcode);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [costTouched, setCostTouched] = useState(false);
  const [unit, setUnit] = useState<"PCS" | "KG">("PCS");
  const [stock, setStock] = useState("");
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  // Другие написания из справочников — кассир выбирает нужное одним тапом.
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);

  const priceRef = useRef<HTMLInputElement>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  // Пришли со скана — код уже есть, сразу в цену. Пришли из «+ Товар» —
  // начинаем со штрихкода.
  useEffect(() => {
    if (initialBarcode) priceRef.current?.focus();
    else barcodeRef.current?.focus();
  }, [initialBarcode]);

  const lookup = async () => {
    const code = barcode.trim();
    if (!isValidBarcode(code)) { setError("Некорректный штрихкод: нужен EAN-13 или EAN-8"); return; }
    setError(null);
    setHint(null);
    setLooking(true);
    const res = await posLookupBarcodeAction(code);
    setLooking(false);
    if (res.ok) {
      setName(res.name);
      if (res.category) setCategory(res.category);
      if (res.unit) setUnit(res.unit);
      setAlternatives(res.alternatives ?? []);
      setHint(
        res.verified
          ? "Название совпало в двух справочниках — проверьте цену"
          : res.inTwoSources
            ? "Штрихкод есть в двух справочниках — сверьте название с упаковкой"
            : res.fromWeb
              ? "ИИ не уверен: сверьте название с упаковкой перед сохранением"
              : res.sure
                ? "Нашёл — проверьте название и цену"
                : "ИИ не уверен: сверьте название с упаковкой перед сохранением",
      );
    } else {
      setError(res.error + ". Впишите название сами.");
    }
  };

  const submit = async (addToCart: boolean) => {
    const p = parseRuNumber(price);
    if (!name.trim()) { setError("Укажите название"); return; }
    if (!(p > 0)) { setError("Укажите цену"); return; }
    setError(null);
    setSaving(true);
    const res = await posCreateProductAction({
      barcode: barcode.trim(), name, category, price: p,
      costPrice: parseRuNumber(costPrice) || 0, unit, stock: parseRuNumber(stock) || 0,
    });
    setSaving(false);
    if (res.ok) onCreated(res.product, addToCart);
    else setError(res.error);
  };

  return (
    <Modal onCancel={onCancel}>
      {/* text-base: касса рендерится в text-lg, на телефоне форма из-за этого
          не помещалась по ширине. */}
      <div className="w-[520px] max-w-full font-app-text text-base">
        <h2 className="text-xl font-semibold mb-1">Новый товар</h2>
        <p className="text-sm text-ink-soft mb-4">
          Товара с таким штрихкодом нет в базе. Заведите его здесь — и он сразу попадёт в чек.
        </p>

        <div className="mb-3">
          <span className="text-sm text-ink-soft">Штрихкод</span>
          {/* На телефоне поле занимает всю ширину, кнопки уходят под него —
              иначе три элемента в ряд не влезают и обрезаются. */}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              ref={barcodeRef}
              value={barcode}
              inputMode="numeric"
              aria-label="Штрихкод"
              onChange={(e) => setBarcode(e.target.value.replace(/[^\d]/g, ""))}
              className="w-full sm:flex-1 min-w-0 h-12 px-3 bg-paper border border-line rounded-tag font-app-mono text-base focus:border-ink"
            />
            <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="h-12 px-4 rounded-tag border border-line text-ink-soft hover:border-ink"
              >
                Скан
              </button>
              <button
                type="button"
                onClick={lookup}
                disabled={looking || !barcode.trim()}
                className="h-12 px-3 rounded-tag border-2 border-ink font-medium disabled:opacity-40 whitespace-nowrap"
              >
                {looking ? "Ищу…" : "✨ Найти по ИИ"}
              </button>
            </div>
          </div>
        </div>

        {hint && <p className={`text-sm mb-2 ${hint.startsWith("ИИ не уверен") ? "text-warn-text" : "text-fresh-text"}`}>{hint}</p>}

        <label className="block mb-3">
          <span className="text-sm text-ink-soft">Название</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="найдёт ИИ или впишите сами"
            className="w-full h-12 px-3 bg-paper border border-line rounded-tag text-base focus:border-ink"
          />
          {alternatives.length > 0 && (
            <span className="flex flex-wrap gap-1.5 mt-1.5">
              <span className="text-xs text-ink-soft self-center">ещё варианты:</span>
              {alternatives.map((alt) => (
                <button
                  key={alt}
                  type="button"
                  onClick={() => setName(alt)}
                  className="text-xs px-2 py-1 rounded-tag border border-line bg-paper hover:border-ink text-left"
                >
                  {alt}
                </button>
              ))}
            </span>
          )}
        </label>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="block">
            <span className="text-sm text-ink-soft">Цена, ₽</span>
            <input
              ref={priceRef}
              value={price}
              inputMode="decimal"
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d.,]/g, "");
                setPrice(v);
                if (!costTouched) setCostPrice(defaultCost(parseRuNumber(v)));
              }}
              className="w-full min-w-0 h-12 px-3 bg-paper border border-line rounded-tag font-app-mono text-base focus:border-ink"
            />
          </label>
          <label className="block">
            <span className="text-sm text-ink-soft">Себестоимость, ₽</span>
            <input
              value={costPrice}
              inputMode="decimal"
              onChange={(e) => { setCostPrice(e.target.value.replace(/[^\d.,]/g, "")); setCostTouched(true); }}
              className="w-full min-w-0 h-12 px-3 bg-paper border border-line rounded-tag font-app-mono text-base focus:border-ink"
            />
          </label>
        </div>

        {/* На телефоне три поля в ряд не помещаются: категория занимает всю
            ширину, остаток и единица делят следующую строку. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <label className="block col-span-2 sm:col-span-1">
            <span className="text-sm text-ink-soft">Категория</span>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Прочее"
              className="w-full min-w-0 h-12 px-3 bg-paper border border-line rounded-tag text-base focus:border-ink"
            />
          </label>
          <label className="block">
            <span className="text-sm text-ink-soft">Остаток</span>
            <input
              value={stock}
              inputMode="decimal"
              placeholder="0"
              onChange={(e) => setStock(e.target.value.replace(/[^\d.,]/g, ""))}
              className="w-full min-w-0 h-12 px-3 bg-paper border border-line rounded-tag font-app-mono text-base focus:border-ink"
            />
          </label>
          <div className="min-w-0">
            <span className="text-sm text-ink-soft">Единица</span>
            <SegmentedControl
              fill
              className="w-full"
              value={unit}
              onChange={setUnit}
              options={[{ value: "PCS" as const, label: "шт" }, { value: "KG" as const, label: "кг" }]}
            />
          </div>
        </div>

        {error && <p className="text-stamp-text text-sm mb-3">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onCancel}
            className="h-14 rounded-tag border border-line text-ink-soft hover:border-ink text-base"
          >
            Отмена
          </button>
          <button
            onClick={() => submit(true)}
            disabled={saving}
            className="h-14 rounded-tag bg-ink text-paper font-medium text-base disabled:opacity-40"
          >
            {saving ? "Сохраняем…" : "Создать и пробить"}
          </button>
        </div>
        <button
          onClick={() => submit(false)}
          disabled={saving}
          className="w-full h-12 mt-2 rounded-tag border border-line text-ink-soft hover:border-ink text-sm disabled:opacity-40"
        >
          Только завести в базу, в чек не добавлять
        </button>
      </div>

      {scannerOpen && (
        <BarcodeScanner
          onScan={(code) => { setBarcode(code); setScannerOpen(false); priceRef.current?.focus(); }}
          onClose={() => setScannerOpen(false)}
        />
      )}
    </Modal>
  );
}
