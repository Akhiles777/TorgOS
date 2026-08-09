"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, DecimalField, SegmentedControl, EmptyState, ConfirmDialog, Modal } from "@/components/ui";
import { Barcode } from "@/components/Barcode";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { money, money0, qty, unitLabel, parseRuNumber } from "@/lib/format";
import type { ProductRow, ProductFilter } from "@/server/services/products";
import { saveProductAction, moveStockAction, deleteProductAction, toggleActiveAction } from "./actions";
import { Overlay } from "@/components/pos/WeightModal";

const FILTER_LABELS: Record<ProductFilter, string> = {
  all: "Все", low: "Мало осталось", expiring: "Скоро истечёт", inactive: "Снятые с продажи",
};

export function ProductsManager({ products, filter, query }: { products: ProductRow[]; filter: ProductFilter; query: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);
  const [newBarcode, setNewBarcode] = useState<string | undefined>(undefined);
  const [moving, setMoving] = useState<ProductRow | null>(null);
  const [printing, setPrinting] = useState<ProductRow | null>(null);
  const [q, setQ] = useState(query);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startAction] = useTransition();

  // Скан в шапке — совмещает «быстрый просмотр» и «приход по сканеру» в одном
  // месте: одна и та же кнопка, дальше решение принимается по результату.
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanResult, setScanResult] = useState<{ code: string; product: ProductRow | null; loading: boolean } | null>(null);

  const handleScanCode = async (code: string) => {
    setScanResult({ code, product: null, loading: true });
    try {
      const res = await fetch(`/api/admin/lookup?barcode=${encodeURIComponent(code)}`);
      const data = await res.json();
      setScanResult({ code, product: data.product ?? null, loading: false });
    } catch {
      setScanResult({ code, product: null, loading: false });
    }
  };

  // Удаление из базы. Если товар уже в чеках — сервис откажет, и мы предлагаем
  // снять с продажи: история продаж важнее, чем чистота справочника. Два шага —
  // два брендированных ConfirmDialog вместо цепочки native confirm().
  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null);
  const [deactivateOffer, setDeactivateOffer] = useState<{ product: ProductRow; reason: string } | null>(null);

  const remove = (p: ProductRow) => setDeleteTarget(p);

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const p = deleteTarget;
    setDeleteTarget(null);
    setBusyId(p.id);
    startAction(async () => {
      const res = await deleteProductAction(p.id);
      setBusyId(null);
      if (res.ok) {
        router.refresh();
        return;
      }
      setDeactivateOffer({ product: p, reason: res.error });
    });
  };

  const confirmDeactivate = () => {
    if (!deactivateOffer) return;
    const p = deactivateOffer.product;
    setDeactivateOffer(null);
    startAction(async () => {
      await toggleActiveAction(p.id, false);
      router.refresh();
    });
  };

  // Вернуть снятый товар обратно в продажу.
  const restore = (p: ProductRow) => {
    setBusyId(p.id);
    startAction(async () => {
      await toggleActiveAction(p.id, true);
      setBusyId(null);
      router.refresh();
    });
  };

  const setFilter = (f: ProductFilter) => {
    const params = new URLSearchParams();
    if (f !== "all") params.set("filter", f);
    if (q) params.set("q", q);
    router.push(`/admin?${params.toString()}`);
  };
  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (filter !== "all") params.set("filter", filter);
    if (q) params.set("q", q);
    router.push(`/admin?${params.toString()}`);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
        <h1 className="text-xl font-semibold w-full sm:w-auto sm:mr-auto">Товары <span className="text-ink-soft font-normal">· {products.length}</span></h1>
        <form onSubmit={submitSearch} className="flex-1 sm:flex-none min-w-0">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск / штрихкод…"
            className="h-10 px-3 bg-paper border border-line rounded-tag w-full sm:w-52 focus:border-ink"
          />
        </form>
        <Button variant="line" onClick={() => setScannerOpen(true)}>Скан</Button>
        <Button variant="stamp" onClick={() => setEditing("new")}>+ Товар</Button>
      </div>

      <SegmentedControl
        className="mb-4"
        value={filter}
        onChange={setFilter}
        options={(Object.keys(FILTER_LABELS) as ProductFilter[]).map((f) => ({ value: f, label: FILTER_LABELS[f] }))}
      />

      {products.length === 0 ? (
        <EmptyState>Ничего не найдено по этому фильтру.</EmptyState>
      ) : (
        <>
          {/* Десктоп/планшет — таблица (без изменений) */}
          <div className="hidden sm:block overflow-x-auto border border-line rounded-tag">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="bg-paper-2 text-ink-soft text-left">
                  <th className="px-3 py-2 font-medium">Товар</th>
                  <th className="px-3 py-2 font-medium">Категория</th>
                  <th className="px-3 py-2 font-medium text-right">Цена</th>
                  <th className="px-3 py-2 font-medium text-right">Себест.</th>
                  <th className="px-3 py-2 font-medium text-right">Наценка</th>
                  <th className="px-3 py-2 font-medium text-right">Остаток</th>
                  <th className="px-3 py-2 font-medium text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const low = p.stock <= (p.unit === "KG" ? 1 : 3);
                  return (
                    <tr key={p.id} className="border-t border-line hover:bg-paper-2/50">
                      <td className="px-3 py-2">
                        <div className="font-medium">{p.name}</div>
                        <div className="font-app-mono text-xs text-ink-soft">{p.barcode ?? "без штрихкода"}</div>
                      </td>
                      <td className="px-3 py-2 text-ink-soft">{p.category}</td>
                      <td className="px-3 py-2 text-right font-app-mono">{money0(p.price)}</td>
                      <td className="px-3 py-2 text-right font-app-mono text-ink-soft">{money0(p.costPrice)}</td>
                      <td className="px-3 py-2 text-right font-app-mono">
                        <span className={p.marginPct < 15 ? "text-stamp-text" : "text-fresh-text"}>{p.marginPct}%</span>
                      </td>
                      <td className="px-3 py-2 text-right font-app-mono">
                        <span className={low ? "text-warn-text font-semibold" : ""}>{qty(p.stock, p.unit)} {unitLabel(p.unit)}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 justify-end items-center">
                          <IconBtn onClick={() => setMoving(p)} title="Приход / списание">±</IconBtn>
                          <IconBtn onClick={() => setEditing(p)} title="Редактировать">✎</IconBtn>
                          {p.barcode && <IconBtn onClick={() => setPrinting(p)} title="Печать штрихкода">▤</IconBtn>}
                          {!p.isActive && <IconBtn onClick={() => restore(p)} title="Вернуть в продажу">↩</IconBtn>}
                          {/* Удаление отделено от остальных действий — необратимо */}
                          <span className="w-px h-6 bg-line mx-1.5 shrink-0" aria-hidden />
                          <IconBtn onClick={() => remove(p)} title="Удалить товар" danger disabled={busyId === p.id}>✕</IconBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Мобильный — карточки вместо горизонтального скролла таблицы */}
          <div className="sm:hidden space-y-2">
            {products.map((p) => {
              const low = p.stock <= (p.unit === "KG" ? 1 : 3);
              return (
                <div key={p.id} className="border border-line rounded-tag bg-paper-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium leading-tight">{p.name}</div>
                      <div className="font-app-mono text-xs text-ink-soft mt-0.5">{p.category} · {p.barcode ?? "без штрихкода"}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-app-mono font-semibold">{money0(p.price)} ₽</div>
                      <div className={`font-app-mono text-xs ${p.marginPct < 15 ? "text-stamp-text" : "text-fresh-text"}`}>наценка {p.marginPct}%</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2.5">
                    <span className={`font-app-mono text-sm ${low ? "text-warn-text font-semibold" : "text-ink-soft"}`}>
                      Остаток: {qty(p.stock, p.unit)} {unitLabel(p.unit)}
                    </span>
                    <div className="flex gap-1.5 items-center">
                      <IconBtn onClick={() => setMoving(p)} title="Приход / списание">±</IconBtn>
                      <IconBtn onClick={() => setEditing(p)} title="Редактировать">✎</IconBtn>
                      {p.barcode && <IconBtn onClick={() => setPrinting(p)} title="Печать штрихкода">▤</IconBtn>}
                      {!p.isActive && <IconBtn onClick={() => restore(p)} title="Вернуть в продажу">↩</IconBtn>}
                      {/* Удаление отделено от остальных действий — необратимо */}
                      <span className="w-px h-6 bg-line mx-1 shrink-0" aria-hidden />
                      <IconBtn onClick={() => remove(p)} title="Удалить товар" danger disabled={busyId === p.id}>✕</IconBtn>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {editing && (
        <ProductModal
          product={editing === "new" ? null : editing}
          initialBarcode={editing === "new" ? newBarcode : undefined}
          onClose={() => { setEditing(null); setNewBarcode(undefined); }}
        />
      )}
      {moving && <MoveModal product={moving} onClose={() => setMoving(null)} />}
      {printing && printing.barcode && <PrintModal product={printing} onClose={() => setPrinting(null)} />}

      {scannerOpen && (
        <BarcodeScanner
          onScan={(code) => {
            setScannerOpen(false);
            handleScanCode(code);
          }}
          onClose={() => setScannerOpen(false)}
        />
      )}

      {scanResult && (
        <Modal onCancel={() => setScanResult(null)}>
          <div className="w-[min(92vw,420px)]">
            <p className="text-ink-soft text-sm font-app-mono">{scanResult.code}</p>
            {scanResult.loading ? (
              <p className="mt-3">Ищу…</p>
            ) : scanResult.product ? (
              <>
                <h2 className="text-xl font-semibold mt-1 mb-3">{scanResult.product.name}</h2>
                {!scanResult.product.isActive && (
                  <p className="text-warn-text text-sm mb-3">Товар снят с продажи.</p>
                )}
                <div className="flex items-baseline py-2 border-t border-b border-dashed border-line">
                  <span>Остаток</span>
                  <span className="leader" aria-hidden />
                  <span className="font-app-mono font-semibold">
                    {qty(scanResult.product.stock, scanResult.product.unit)} {unitLabel(scanResult.product.unit)}
                  </span>
                </div>
                <div className="flex items-baseline py-2 border-b border-dashed border-line">
                  <span>Цена</span>
                  <span className="leader" aria-hidden />
                  <span className="font-app-mono font-semibold">{money0(scanResult.product.price)} ₽</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-5">
                  <Button
                    variant="line"
                    size="lg"
                    onClick={() => {
                      if (!scanResult.product) return;
                      setEditing(scanResult.product);
                      setScanResult(null);
                    }}
                  >
                    Редактировать
                  </Button>
                  <Button
                    variant="fresh"
                    size="lg"
                    onClick={() => {
                      if (!scanResult.product) return;
                      setMoving(scanResult.product);
                      setScanResult(null);
                    }}
                  >
                    Приход
                  </Button>
                </div>
                {!scanResult.product.isActive && (
                  <Button
                    variant="line"
                    size="lg"
                    className="w-full mt-2"
                    onClick={() => {
                      if (!scanResult.product) return;
                      restore(scanResult.product);
                      setScanResult(null);
                    }}
                  >
                    Вернуть в продажу
                  </Button>
                )}
                <Button variant="ghost" size="lg" className="w-full mt-2" onClick={() => { setScanResult(null); setScannerOpen(true); }}>
                  Сканировать ещё
                </Button>
              </>
            ) : (
              <>
                <p className="mt-3">Товар с этим штрихкодом не найден.</p>
                <div className="grid grid-cols-2 gap-3 mt-5">
                  <Button variant="line" size="lg" onClick={() => { setScanResult(null); setScannerOpen(true); }}>
                    Сканировать ещё
                  </Button>
                  <Button
                    variant="stamp"
                    size="lg"
                    onClick={() => {
                      setNewBarcode(scanResult.code);
                      setEditing("new");
                      setScanResult(null);
                    }}
                  >
                    Добавить товар
                  </Button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Удалить «${deleteTarget?.name}» из базы?`}
        body="Отменить будет нельзя."
        confirmLabel="Удалить"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <ConfirmDialog
        open={!!deactivateOffer}
        title={`Снять «${deactivateOffer?.product.name}» с продажи?`}
        body={`${deactivateOffer?.reason} Товар останется в базе, но пропадёт из кассы.`}
        confirmLabel="Снять с продажи"
        danger={false}
        onConfirm={confirmDeactivate}
        onCancel={() => setDeactivateOffer(null)}
      />
    </div>
  );
}

function IconBtn({
  children, onClick, title, danger = false, disabled = false,
}: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={`w-8 h-8 shrink-0 grid place-items-center rounded-tag border disabled:opacity-40 ${
        danger
          ? "border-stamp/40 text-stamp-text hover:bg-stamp hover:text-stamp-ink hover:border-stamp"
          : "border-line hover:border-ink hover:bg-paper"
      }`}
    >
      {children}
    </button>
  );
}

// Себестоимость по умолчанию — цена минус 20% (то есть минус её пятая часть):
// price - price/5 = price * 0.8.
function defaultCostPrice(price: number): string {
  if (price <= 0) return "";
  const cost = Math.round((price - price / 5) * 100) / 100;
  return String(cost);
}

function ProductModal({ product, initialBarcode, onClose }: { product: ProductRow | null; initialBarcode?: string; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [unit, setUnit] = useState(product?.unit ?? "PCS");

  // Себестоимость на новом товаре считается сама (цена − 20%), пока её не
  // тронули руками — тогда автоподстановка выключается насовсем для этой формы.
  const [price, setPrice] = useState(product?.price != null ? String(product.price) : "");
  const [costPrice, setCostPrice] = useState(product?.costPrice != null ? String(product.costPrice) : "");
  const [costTouched, setCostTouched] = useState(!!product);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [scanningBarcode, setScanningBarcode] = useState(false);

  const onSubmit = (fd: FormData) => {
    fd.set("unit", unit);
    start(async () => {
      const res = await saveProductAction(null, fd);
      if (res.ok) { onClose(); router.refresh(); }
      else setError(res.error);
    });
  };

  return (
    <Overlay onCancel={onClose}>
      <form
        action={onSubmit}
        onKeyDown={(e) => {
          // Штрихкод-сканер шлёт Enter после цифр — не даём ему преждевременно
          // отправить форму, пока не заполнены остальные обязательные поля.
          if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "BUTTON") e.preventDefault();
        }}
        className="w-[min(94vw,520px)] space-y-3"
      >
        <h2 className="text-xl font-semibold">{product ? "Редактировать товар" : "Новый товар"}</h2>
        {product && <input type="hidden" name="id" value={product.id} />}
        <label className="block">
          <span className="text-sm text-ink-soft">Название</span>
          <input name="name" defaultValue={product?.name} required autoFocus className="w-full h-11 px-3 bg-paper border border-line rounded-tag focus:border-ink" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-ink-soft">Категория</span>
            <input name="category" defaultValue={product?.category} className="w-full h-11 px-3 bg-paper border border-line rounded-tag focus:border-ink" />
          </label>
          <div>
            <span className="text-sm text-ink-soft">Единица</span>
            <SegmentedControl
              fill
              className="mt-0 w-full"
              value={unit}
              onChange={setUnit}
              options={[{ value: "PCS", label: "шт" }, { value: "KG", label: "кг" }]}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <DecimalField
            name="price"
            label="Цена продажи, ₽"
            value={price}
            onValueChange={(v) => {
              setPrice(v);
              if (!costTouched) setCostPrice(defaultCostPrice(parseRuNumber(v)));
            }}
            required
          />
          <div>
            <DecimalField
              name="costPrice"
              label="Себестоимость, ₽"
              value={costPrice}
              onValueChange={(v) => {
                setCostPrice(v);
                setCostTouched(true);
              }}
              required
            />
            {!product && !costTouched && costPrice && (
              <span className="block text-xs text-ink-soft mt-1">авто: цена − 20% · можно изменить</span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-ink-soft">Штрихкод (EAN-13 или EAN-8)</span>
            <div className="relative">
              <input
                ref={barcodeRef}
                name="barcode"
                defaultValue={product?.barcode ?? initialBarcode ?? ""}
                placeholder={unit === "KG" ? "сгенерируется" : "13 или 8 цифр"}
                onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                className="w-full h-11 pl-3 pr-11 bg-paper border border-line rounded-tag font-app-mono focus:border-ink"
              />
              <button
                type="button"
                onClick={() => setScanningBarcode(true)}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center rounded-tag text-ink-soft hover:text-ink hover:bg-paper-2"
                aria-label="Сканировать штрихкод камерой"
                title="Сканировать камерой"
              >
                <CameraIcon />
              </button>
            </div>
          </label>
          <label className="block">
            <span className="text-sm text-ink-soft">Срок годности</span>
            <input name="expiry" type="date" defaultValue={product?.expiry ?? ""} className="w-full h-11 px-3 bg-paper border border-line rounded-tag focus:border-ink" />
          </label>
        </div>
        {!product && <DecimalField name="stock" label="Начальный остаток" defaultValue="0" />}
        <label className="flex items-start gap-2.5 bg-paper-2 border border-line rounded-tag p-3 cursor-pointer">
          <input type="checkbox" name="showInPos" defaultChecked={product?.showInPos ?? false} className="mt-0.5 w-5 h-5 accent-stamp" />
          <span className="text-sm">
            Показывать плиткой в кассе
            <span className="block text-xs text-ink-soft">Для товаров без штрихкода или тех, что неудобно сканировать (тяжёлая вода и т.п.).</span>
          </span>
        </label>
        {error && <p className="text-stamp-text text-sm">{error}</p>}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button type="button" variant="line" size="lg" onClick={onClose}>Отмена</Button>
          <Button type="submit" variant="stamp" size="lg" disabled={pending}>{pending ? "Сохраняем…" : "Сохранить"}</Button>
        </div>
      </form>
      {scanningBarcode && (
        <BarcodeScanner
          onScan={(code) => {
            if (barcodeRef.current) barcodeRef.current.value = code;
            setScanningBarcode(false);
          }}
          onClose={() => setScanningBarcode(false)}
        />
      )}
    </Overlay>
  );
}

// Простая монохромная иконка камеры — своя, без иконочных наборов.
function CameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13.5" r="3.2" />
    </svg>
  );
}

function MoveModal({ product, onClose }: { product: ProductRow; onClose: () => void }) {
  const router = useRouter();
  const [type, setType] = useState<"IN" | "OUT" | "WRITEOFF">("IN");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onSubmit = (fd: FormData) => {
    fd.set("id", product.id);
    fd.set("type", type);
    start(async () => {
      const res = await moveStockAction(null, fd);
      if (res.ok) { onClose(); router.refresh(); }
      else setError(res.error);
    });
  };
  const labels = { IN: "Приход", OUT: "Расход", WRITEOFF: "Списание" };

  return (
    <Overlay onCancel={onClose}>
      <form action={onSubmit} className="w-[min(92vw,420px)] space-y-4">
        <div>
          <h2 className="text-xl font-semibold">{product.name}</h2>
          <p className="text-ink-soft text-sm">Остаток сейчас: {qty(product.stock, product.unit)} {unitLabel(product.unit)}</p>
        </div>
        <SegmentedControl
          fill
          value={type}
          onChange={setType}
          options={(["IN", "OUT", "WRITEOFF"] as const).map((t) => ({ value: t, label: labels[t] }))}
        />
        <label className="block">
          <span className="text-sm text-ink-soft">Количество, {unitLabel(product.unit)}</span>
          <input
            name="quantity"
            type="text"
            inputMode="decimal"
            required
            autoFocus
            onInput={(e) => {
              const el = e.currentTarget;
              const cleaned = el.value.replace(/[^\d.,]/g, "");
              if (cleaned !== el.value) el.value = cleaned;
            }}
            className="w-full h-14 px-3 text-2xl font-app-mono bg-paper border border-line rounded-tag focus:border-ink"
          />
        </label>
        <label className="block">
          <span className="text-sm text-ink-soft">Причина / комментарий</span>
          <input name="reason" placeholder={type === "WRITEOFF" ? "истёк срок, брак…" : "поставка…"}
            className="w-full h-11 px-3 bg-paper border border-line rounded-tag focus:border-ink" />
        </label>
        {error && <p className="text-stamp-text text-sm">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="line" size="lg" onClick={onClose}>Отмена</Button>
          <Button type="submit" variant={type === "IN" ? "fresh" : "stamp"} size="lg" disabled={pending}>
            {pending ? "…" : labels[type]}
          </Button>
        </div>
      </form>
    </Overlay>
  );
}

function PrintModal({ product, onClose }: { product: ProductRow; onClose: () => void }) {
  return (
    <Overlay onCancel={onClose}>
      <div className="w-[min(92vw,360px)] text-center">
        <h2 className="text-lg font-semibold mb-1">Ярлык товара</h2>
        <p className="text-ink-soft text-sm mb-4">{product.name}</p>
        <div className="bg-white p-4 rounded-tag inline-block border border-line" id="label">
          <div className="text-black font-semibold text-sm mb-1">{product.name}</div>
          <div className="text-black font-app-mono font-bold text-lg mb-1">{money(product.price)}/{unitLabel(product.unit)}</div>
          <Barcode value={product.barcode!} />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-5">
          <Button variant="line" size="lg" onClick={onClose}>Закрыть</Button>
          <Button variant="stamp" size="lg" onClick={() => window.print()}>Печать</Button>
        </div>
      </div>
    </Overlay>
  );
}
