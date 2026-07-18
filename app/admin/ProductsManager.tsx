"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, DecimalField } from "@/components/ui";
import { Barcode } from "@/components/Barcode";
import { money, money0, qty, unitLabel } from "@/lib/format";
import type { ProductRow, ProductFilter } from "@/server/services/products";
import { saveProductAction, moveStockAction } from "./actions";
import { Overlay } from "@/components/pos/WeightModal";

const FILTER_LABELS: Record<ProductFilter, string> = {
  all: "Все", low: "Мало осталось", expiring: "Скоро истечёт", inactive: "Снятые с продажи",
};

export function ProductsManager({ products, filter, query }: { products: ProductRow[]; filter: ProductFilter; query: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);
  const [moving, setMoving] = useState<ProductRow | null>(null);
  const [printing, setPrinting] = useState<ProductRow | null>(null);
  const [q, setQ] = useState(query);

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
        <Button variant="stamp" onClick={() => setEditing("new")}>+ Товар</Button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {(Object.keys(FILTER_LABELS) as ProductFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`h-9 px-3 rounded-tag border text-sm ${filter === f ? "bg-ink text-paper border-ink" : "bg-paper border-line hover:bg-paper-2"}`}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {products.length === 0 ? (
        <p className="text-ink-soft py-10 text-center bg-paper-2 border border-line rounded-tag">Ничего не найдено по этому фильтру.</p>
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
                        <div className="font-mono-nums text-xs text-ink-soft">{p.barcode ?? "без штрихкода"}</div>
                      </td>
                      <td className="px-3 py-2 text-ink-soft">{p.category}</td>
                      <td className="px-3 py-2 text-right font-mono-nums">{money0(p.price)}</td>
                      <td className="px-3 py-2 text-right font-mono-nums text-ink-soft">{money0(p.costPrice)}</td>
                      <td className="px-3 py-2 text-right font-mono-nums">
                        <span className={p.marginPct < 15 ? "text-stamp" : "text-fresh"}>{p.marginPct}%</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono-nums">
                        <span className={low ? "text-warn font-semibold" : ""}>{qty(p.stock, p.unit)} {unitLabel(p.unit)}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 justify-end">
                          <IconBtn onClick={() => setMoving(p)} title="Приход / списание">±</IconBtn>
                          <IconBtn onClick={() => setEditing(p)} title="Редактировать">✎</IconBtn>
                          {p.barcode && <IconBtn onClick={() => setPrinting(p)} title="Печать штрихкода">▤</IconBtn>}
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
                      <div className="font-mono-nums text-xs text-ink-soft mt-0.5">{p.category} · {p.barcode ?? "без штрихкода"}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono-nums font-semibold">{money0(p.price)} ₽</div>
                      <div className={`font-mono-nums text-xs ${p.marginPct < 15 ? "text-stamp" : "text-fresh"}`}>наценка {p.marginPct}%</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2.5">
                    <span className={`font-mono-nums text-sm ${low ? "text-warn font-semibold" : "text-ink-soft"}`}>
                      Остаток: {qty(p.stock, p.unit)} {unitLabel(p.unit)}
                    </span>
                    <div className="flex gap-1.5">
                      <IconBtn onClick={() => setMoving(p)} title="Приход / списание">±</IconBtn>
                      <IconBtn onClick={() => setEditing(p)} title="Редактировать">✎</IconBtn>
                      {p.barcode && <IconBtn onClick={() => setPrinting(p)} title="Печать штрихкода">▤</IconBtn>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {editing && <ProductModal product={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {moving && <MoveModal product={moving} onClose={() => setMoving(null)} />}
      {printing && printing.barcode && <PrintModal product={printing} onClose={() => setPrinting(null)} />}
    </div>
  );
}

function IconBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title} aria-label={title}
      className="w-8 h-8 grid place-items-center rounded-tag border border-line hover:border-ink hover:bg-paper">
      {children}
    </button>
  );
}

function ProductModal({ product, onClose }: { product: ProductRow | null; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [unit, setUnit] = useState(product?.unit ?? "PCS");

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
            <div className="grid grid-cols-2 gap-1">
              {(["PCS", "KG"] as const).map((u) => (
                <button type="button" key={u} onClick={() => setUnit(u)}
                  className={`h-11 rounded-tag border font-medium ${unit === u ? "bg-ink text-paper border-ink" : "bg-paper border-line"}`}>
                  {u === "PCS" ? "шт" : "кг"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <DecimalField name="price" label="Цена продажи, ₽" defaultValue={product?.price} required />
          <DecimalField name="costPrice" label="Себестоимость, ₽" defaultValue={product?.costPrice} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-ink-soft">Штрихкод (EAN-13)</span>
            <input
              name="barcode"
              defaultValue={product?.barcode ?? ""}
              placeholder={unit === "KG" ? "сгенерируется" : "13 цифр"}
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              className="w-full h-11 px-3 bg-paper border border-line rounded-tag font-mono-nums focus:border-ink"
            />
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
        {error && <p className="text-stamp text-sm">{error}</p>}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button type="button" variant="line" size="lg" onClick={onClose}>Отмена</Button>
          <Button type="submit" variant="stamp" size="lg" disabled={pending}>{pending ? "Сохраняем…" : "Сохранить"}</Button>
        </div>
      </form>
    </Overlay>
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
        <div className="grid grid-cols-3 gap-2">
          {(["IN", "OUT", "WRITEOFF"] as const).map((t) => (
            <button type="button" key={t} onClick={() => setType(t)}
              className={`h-11 rounded-tag border text-sm font-medium ${type === t ? "bg-ink text-paper border-ink" : "bg-paper border-line"}`}>
              {labels[t]}
            </button>
          ))}
        </div>
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
            className="w-full h-14 px-3 text-2xl font-mono-nums bg-paper border border-line rounded-tag focus:border-ink"
          />
        </label>
        <label className="block">
          <span className="text-sm text-ink-soft">Причина / комментарий</span>
          <input name="reason" placeholder={type === "WRITEOFF" ? "истёк срок, брак…" : "поставка…"}
            className="w-full h-11 px-3 bg-paper border border-line rounded-tag focus:border-ink" />
        </label>
        {error && <p className="text-stamp text-sm">{error}</p>}
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
          <div className="text-black font-mono-nums font-bold text-lg mb-1">{money(product.price)}/{unitLabel(product.unit)}</div>
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
