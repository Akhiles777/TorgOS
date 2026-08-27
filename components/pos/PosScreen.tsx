"use client";
// Шрифты приложения — самохостинг, отдельная пара от лендинга (см. дизайн-план
// системы): Unbounded для табло/крупных чисел, Golos Text для текста, JetBrains
// Mono для колонок цифр. Полные 400/700-файлы, не cyrillic-*: у поднаборов по
// unicode-range цифры лежат в latin, отдельный cyrillic-файл их не покрывает.
import "@fontsource-variable/unbounded/wght.css";
import "@fontsource-variable/golos-text/wght.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { Receipt } from "./Receipt";
import { Tiles } from "./Tiles";
import { WeightModal } from "./WeightModal";
import { PaymentModal, type DebtInfo } from "./PaymentModal";
import { useStockSocket } from "./useStockSocket";
import { useRemoteScan } from "./useRemoteScan";
import { Modal, ReadoutPanel } from "@/components/ui";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { QuickProductModal } from "./QuickProductModal";
import { money0 } from "@/lib/format";
import { logoutAction } from "@/app/logout/action";
import { endImpersonationAction } from "@/app/impersonate/actions";
import { startShiftAction } from "@/app/pos/actions";
import { RestockBanner } from "@/components/RestockBanner";
import type { StockUpdate } from "@/server/realtime";
import type { CartLine, PaymentMethod, PosProduct } from "./types";

type Flash = { kind: "add" | "error"; text: string } | null;
type Mode =
  | { t: "idle" }
  | { t: "weight"; product: PosProduct }
  | { t: "payment"; method: PaymentMethod }
  | { t: "done"; change: number | null; number: number; debt: boolean };

let keyCounter = 0;
const nextKey = () => `l${++keyCounter}`;

type ShiftEmployee = { id: string; name: string };

export function PosScreen({
  initialProducts,
  accountName,
  employees,
  currentShift,
  impersonating,
}: {
  initialProducts: PosProduct[];
  accountName: string;
  employees: ShiftEmployee[];
  currentShift: ShiftEmployee | null;
  impersonating?: boolean;
}) {
  // Список товаров пополняется прямо с кассы (заведение неизвестного
  // штрихкода), поэтому это состояние, а не константа.
  const [products, setProducts] = useState(initialProducts);
  const [stock, setStock] = useState<Record<string, number>>(() =>
    Object.fromEntries(initialProducts.map((p) => [p.id, p.stock])),
  );
  const [cart, setCart] = useState<CartLine[]>([]);
  const [mode, setMode] = useState<Mode>({ t: "idle" });
  const [flash, setFlash] = useState<Flash>(null);
  const [search, setSearch] = useState("");
  const [tearing, setTearing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shift, setShift] = useState<ShiftEmployee | null>(currentShift);
  // Пикер смены открыт, если есть сотрудники, но никто ещё не выбран на день.
  const [pickingShift, setPickingShift] = useState(employees.length > 0 && !currentShift);
  // Камера-сканер: оверлей остаётся открытым между сканами — закрывает только кассир.
  const [cameraOpen, setCameraOpen] = useState(false);
  // Заведение товара с кассы: строка — штрихкод, который пробили, но не нашли
  // (или пустая, если кассир сам нажал «+ Товар»).
  const [quickAdd, setQuickAdd] = useState<string | null>(null);
  // Подсказка с адресом /pos/scan — чтобы открыть его на другом устройстве.
  const [phoneScanInfoOpen, setPhoneScanInfoOpen] = useState(false);
  const [scanUrl, setScanUrl] = useState("");
  useEffect(() => {
    setScanUrl(`${location.origin}/pos/scan`);
  }, []);

  const scannerRef = useRef<HTMLInputElement>(null);
  const scanBuf = useRef("");
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productsRef = useRef(products);
  // handleScan читает каталог через ref (чтобы не пересоздаваться на каждое
  // изменение) — держим ref в актуальном состоянии после заведения товара.
  productsRef.current = products;

  const total = cart.reduce((s, l) => s + l.price * l.quantity, 0);
  const modalOpen = mode.t === "weight" || mode.t === "payment" || cameraOpen || quickAdd !== null;

  // Остатки с наложенными живыми обновлениями (для плиток)
  const liveProducts = products.map((p) => ({ ...p, stock: stock[p.id] ?? p.stock }));

  const socketStatus = useStockSocket(
    useCallback((updates: StockUpdate[]) => {
      setStock((prev) => {
        const next = { ...prev };
        for (const u of updates) next[u.productId] = u.stock;
        return next;
      });
    }, []),
  );

  const showFlash = useCallback((f: Flash) => {
    setFlash(f);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 1600);
  }, []);

  const [shiftBusy, setShiftBusy] = useState(false);
  const chooseShift = useCallback(async (emp: ShiftEmployee) => {
    setShiftBusy(true);
    const res = await startShiftAction(emp.id);
    setShiftBusy(false);
    if (res.ok) {
      setShift(res.employee);
      setPickingShift(false);
      showFlash({ kind: "add", text: `Смена: ${res.employee.name}` });
    } else {
      showFlash({ kind: "error", text: res.error });
    }
  }, [showFlash]);

  // Держим скрытый инпут сканера в фокусе, пока нет модалок/пикера смены и активного поля ввода
  const refocus = useCallback(() => {
    if (modalOpen || pickingShift) return;
    const active = document.activeElement;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA") && active !== scannerRef.current) return;
    scannerRef.current?.focus();
  }, [modalOpen, pickingShift]);

  useEffect(() => {
    refocus();
    const id = setInterval(refocus, 400);
    return () => clearInterval(id);
  }, [refocus]);

  const addProduct = useCallback(
    (p: PosProduct, quantity?: number) => {
      if (p.unit === "KG" && quantity == null) {
        setMode({ t: "weight", product: p });
        return;
      }
      const q = quantity ?? 1;
      setCart((prev) => {
        // штучные — объединяем в одну строку, развесные — отдельная строка на взвешивание
        if (p.unit === "PCS") {
          const idx = prev.findIndex((l) => l.productId === p.id);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + q };
            return copy;
          }
        }
        return [...prev, { key: nextKey(), productId: p.id, name: p.name, unit: p.unit, price: p.price, quantity: q }];
      });
      showFlash({ kind: "add", text: `${p.name} · ${money0(p.price * (quantity ?? 1))} ₽` });
    },
    [showFlash],
  );

  const handleScan = useCallback(
    (code: string) => {
      const found = productsRef.current.find((p) => p.barcode === code);
      if (!found) {
        // Раньше здесь всё заканчивалось красным флешем и кассир звал админа.
        // Теперь сразу предлагаем завести товар: ИИ найдёт название по коду.
        showFlash({ kind: "error", text: `Штрихкод ${code} не найден` });
        setQuickAdd(code);
        return;
      }
      addProduct(found);
    },
    [addProduct, showFlash],
  );

  // Скан с телефона (/pos/scan) прилетает по WS и обрабатывается ровно как
  // проводной сканер — тем же handleScan, без отдельной ветки логики.
  useRemoteScan(handleScan);

  const clearCart = useCallback(() => {
    setCart([]);
    setSearch("");
  }, []);

  // ИИ-поиск товара (нечёткий, с опечатками) — возвращает id подходящих.
  const aiSearch = useCallback(async (q: string): Promise<string[]> => {
    try {
      const res = await fetch("/api/pos/ai-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      return Array.isArray(data.ids) ? data.ids : [];
    } catch {
      return [];
    }
  }, []);

  const doPay = useCallback(
    async (method: PaymentMethod, cashGiven: number | null, debt: DebtInfo | null) => {
      if (busy) return;
      setBusy(true);
      try {
        const res = await fetch("/api/pos/commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lines: cart.map((l) => ({ productId: l.productId, quantity: l.quantity })),
            paymentMethod: method,
            cashGiven,
            isDebt: !!debt,
            debtorName: debt?.debtorName || null,
            debtorContact: debt?.debtorContact || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          showFlash({ kind: "error", text: data.error ?? "Ошибка оплаты" });
          setBusy(false);
          return;
        }
        // Локально применяем новые остатки сразу (WS придёт и подтвердит)
        setStock((prev) => {
          const next = { ...prev };
          for (const u of data.stockUpdates as StockUpdate[]) next[u.productId] = u.stock;
          return next;
        });
        setTearing(true);
        setTimeout(() => {
          setTearing(false);
          clearCart();
          setMode({ t: "done", change: data.changeGiven, number: data.number, debt: !!debt });
          setBusy(false);
          setTimeout(() => setMode((m) => (m.t === "done" ? { t: "idle" } : m)), 3500);
        }, 460);
      } catch {
        showFlash({ kind: "error", text: "Нет связи с сервером" });
        setBusy(false);
      }
    },
    [busy, cart, clearCart, showFlash],
  );

  // Горячие клавиши: F2/F3 — оплата (карту не принимаем), Delete — очистить, Esc — закрыть
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Модалки веса/камеры/заведения товара ловят свои клавиши — F2/F3 не
      // должны из-под них открывать оплату.
      if (mode.t === "weight" || cameraOpen || quickAdd !== null) return;
      if (["F2", "F3"].includes(e.key)) {
        e.preventDefault();
        if (cart.length === 0) {
          showFlash({ kind: "error", text: "Чек пуст" });
          return;
        }
        const method: PaymentMethod = e.key === "F2" ? "CASH" : "TRANSFER";
        setMode({ t: "payment", method });
      } else if (e.key === "Escape") {
        if (mode.t === "payment" && !busy) setMode({ t: "idle" });
      } else if (e.key === "Delete" && mode.t === "idle") {
        e.preventDefault();
        if (cart.length) clearCart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, cart, busy, clearCart, showFlash, cameraOpen, quickAdd]);

  const incLine = (key: string) =>
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, quantity: l.unit === "PCS" ? l.quantity + 1 : Math.round((l.quantity + 0.1) * 1000) / 1000 } : l)));
  const decLine = (key: string) =>
    setCart((prev) =>
      prev.flatMap((l) => {
        if (l.key !== key) return [l];
        const step = l.unit === "PCS" ? 1 : 0.1;
        const q = Math.round((l.quantity - step) * 1000) / 1000;
        return q > 0 ? [{ ...l, quantity: q }] : [];
      }),
    );
  const removeLine = (key: string) => setCart((prev) => prev.filter((l) => l.key !== key));

  return (
    <div className="flex flex-col lg:flex-row h-[100dvh] overflow-hidden font-app-text text-lg">
      {impersonating && (
        <div className="fixed top-0 inset-x-0 z-40 bg-warn text-ink px-3 py-1.5 text-xs flex items-center justify-between gap-2">
          <span>Вход как {accountName} через root</span>
          <form action={endImpersonationAction}>
            <button type="submit" className="h-6 px-2 rounded-tag bg-ink text-paper text-xs font-medium">
              Вернуться
            </button>
          </form>
        </div>
      )}
      <RestockBanner />
      {/* Скрытый инпут сканера — всегда в фокусе в режиме idle */}
      <input
        ref={scannerRef}
        aria-hidden
        tabIndex={-1}
        className="absolute w-px h-px opacity-0 -z-10"
        value=""
        onChange={() => {}}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const code = scanBuf.current.trim();
            scanBuf.current = "";
            if (code) handleScan(code);
          } else if (e.key.length === 1) {
            scanBuf.current += e.key;
          }
        }}
        onBlur={() => setTimeout(refocus, 60)}
      />

      {/* Лента чека */}
      <aside className="lg:w-[440px] w-full lg:h-full h-[45vh] shrink-0 border-b lg:border-b-0 lg:border-r border-line bg-paper relative">
        <Receipt lines={cart} total={total} tearing={tearing} onInc={incLine} onDec={decLine} onRemove={removeLine} />
      </aside>

      {/* Рабочая зона */}
      <main className="flex-1 flex flex-col min-w-0 p-3 sm:p-4 gap-2.5 sm:gap-3">
        <header className="flex items-center gap-2 sm:gap-3 shrink-0 flex-wrap">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск…"
            className="flex-1 min-w-[120px] h-14 px-3 text-base bg-paper border border-line rounded-tag focus:border-ink"
          />
          <button
            onClick={() => setCameraOpen(true)}
            className="h-14 px-3 sm:px-4 rounded-tag border border-line font-medium hover:border-ink transition-colors shrink-0"
          >
            Скан
          </button>
          <button
            onClick={() => setPhoneScanInfoOpen(true)}
            className="h-14 px-3 sm:px-4 rounded-tag border border-line text-ink-soft font-medium hover:border-ink transition-colors shrink-0"
            title="Сканировать с другого устройства, а пробивать здесь"
          >
            С телефона
          </button>
          <button
            onClick={() => setQuickAdd("")}
            className="h-14 px-3 sm:px-4 rounded-tag border border-line font-medium hover:border-ink transition-colors shrink-0"
            title="Завести новый товар прямо с кассы"
          >
            + Товар
          </button>
          <StatusDot status={socketStatus} />
          {/* Кто на смене — тап открывает пикер (пересменка среди дня) */}
          {employees.length > 0 && (
            <button
              onClick={() => setPickingShift(true)}
              className="h-14 px-3 sm:px-4 inline-flex items-center gap-1.5 rounded-tag border border-line text-base hover:border-ink transition-colors shrink-0"
              title="Сменить, кто на смене"
            >
              <span className="text-ink-soft hidden sm:inline">Смена:</span>
              <span className="font-medium truncate max-w-[6rem] sm:max-w-none">{shift ? shift.name : "выбрать"}</span>
              <span className="text-ink-soft">⟳</span>
            </button>
          )}
          <span className="text-sm text-ink-soft hidden lg:block">{accountName}</span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="h-14 px-3.5 grid place-items-center rounded-tag border border-line text-ink-soft text-base hover:text-stamp-text hover:border-stamp transition-colors"
            >
              Выйти
            </button>
          </form>
        </header>

        <div className="flex-1 min-h-0">
          <Tiles products={liveProducts} stock={stock} query={search} onPick={(p) => addProduct(p)} onAiSearch={aiSearch} />
        </div>

        {/* Панель оплаты + подсказки клавиш */}
        <footer className="shrink-0 grid grid-cols-[1fr_auto] gap-3 items-center">
          <div className="flex gap-2">
            <PayBtn label="Наличные" hotkey="F2" onClick={() => trigger("F2")} disabled={!cart.length} />
            <PayBtn label="Перевод" hotkey="F3" onClick={() => trigger("F3")} disabled={!cart.length} />
          </div>
          <button
            onClick={() => cart.length && clearCart()}
            disabled={!cart.length}
            className="h-14 px-3.5 sm:px-5 rounded-tag border border-line text-ink-soft hover:text-stamp-text hover:border-stamp disabled:opacity-40 transition-colors"
          >
            Очистить <span className="text-xs opacity-60 hidden sm:inline">Del</span>
          </button>
        </footer>
      </main>

      {/* Флеш-уведомление сканера — различимо боковым зрением */}
      {flash && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-40 px-5 py-3 rounded-tag border-2 font-medium text-lg shadow-lg ${
            flash.kind === "add" ? "bg-fresh text-stamp-ink border-fresh" : "bg-stamp text-stamp-ink border-stamp animate-shake"
          }`}
          role="status"
        >
          {flash.kind === "add" ? "✓ " : "✕ "}
          {flash.text}
        </div>
      )}

      {/* Пикер смены: раз в сутки (после 07:00 МСК) касса спрашивает, кто заступил.
          Одним тапом. Пока никто не выбран — оверлей, чтобы продажи не ушли «в никуда». */}
      {pickingShift && (
        <Modal onCancel={() => shift && setPickingShift(false)}>
          <div className="w-[min(94vw,460px)] font-app-text">
            <h2 className="text-2xl font-semibold text-center">Кто на смене?</h2>
            <p className="text-ink-soft text-base text-center mt-1 mb-5">Нажмите своё имя — продажи запишутся на вас.</p>
            <div className="grid gap-2.5">
              {employees.map((e) => (
                <button
                  key={e.id}
                  onClick={() => chooseShift(e)}
                  disabled={shiftBusy}
                  className={`min-h-16 px-5 rounded-tag border-2 text-xl font-semibold transition active:scale-[0.98] disabled:opacity-50 ${
                    shift?.id === e.id ? "border-fresh bg-fresh/10 text-fresh-text" : "border-line bg-paper-2 hover:border-ink"
                  }`}
                >
                  {e.name}
                </button>
              ))}
            </div>
            {shift && (
              <button
                onClick={() => setPickingShift(false)}
                className="w-full mt-4 h-14 rounded-tag border border-line text-ink-soft hover:border-ink"
              >
                Отмена
              </button>
            )}
          </div>
        </Modal>
      )}

      {cameraOpen && <BarcodeScanner onScan={handleScan} onClose={() => setCameraOpen(false)} />}

      {quickAdd !== null && (
        <QuickProductModal
          initialBarcode={quickAdd}
          onCancel={() => setQuickAdd(null)}
          onCreated={(product, addToCart) => {
            setProducts((prev) => [...prev, product]);
            setStock((prev) => ({ ...prev, [product.id]: product.stock }));
            setQuickAdd(null);
            if (addToCart) addProduct(product, product.unit === "KG" ? undefined : 1);
            else showFlash({ kind: "add", text: `${product.name} — заведён` });
          }}
        />
      )}

      {phoneScanInfoOpen && (
        <Modal onCancel={() => setPhoneScanInfoOpen(false)}>
          <div className="w-[min(92vw,380px)] font-app-text">
            <h2 className="text-xl font-semibold mb-1">Скан с телефона</h2>
            <p className="text-ink-soft text-sm mb-4">
              Откройте этот адрес в браузере на телефоне (под тем же логином) — то, что там отсканируете, появится в
              чеке прямо здесь, на этой кассе.
            </p>
            <div className="bg-paper-2 border border-line rounded-tag px-3 py-3 font-app-mono text-sm break-all select-all">
              {scanUrl || "…"}
            </div>
            <p className="text-xs text-ink-soft mt-3">Камера на этом компьютере при этом продолжает работать как обычно.</p>
            <button
              onClick={() => setPhoneScanInfoOpen(false)}
              className="w-full h-11 mt-5 rounded-tag border border-line text-ink-soft hover:border-ink"
            >
              Понятно
            </button>
          </div>
        </Modal>
      )}

      {mode.t === "weight" && (
        <WeightModal
          product={mode.product}
          onConfirm={(kg) => {
            addProduct(mode.product, kg);
            setMode({ t: "idle" });
          }}
          onCancel={() => setMode({ t: "idle" })}
        />
      )}

      {mode.t === "payment" && (
        <PaymentModal
          total={total}
          initialMethod={mode.method}
          busy={busy}
          onPay={doPay}
          onCancel={() => setMode({ t: "idle" })}
        />
      )}

      {mode.t === "done" && (
        <div className="fixed inset-0 z-50 bg-ink/40 grid place-items-center p-4 font-app-text" onClick={() => setMode({ t: "idle" })}>
          <div className="bg-paper rounded-tag border border-line shadow-2xl px-10 py-8 text-center w-[min(94vw,420px)]">
            <div className={`inline-block px-5 py-2 text-2xl font-bold mb-4 ${mode.debt ? "border-2 border-warn text-warn-text rounded-md rotate-[-6deg] uppercase tracking-wide" : "stamp"}`}>
              {mode.debt ? "В долг" : "Пробито"}
            </div>
            <p className="text-ink-soft text-base">Чек №{mode.number}</p>
            {mode.debt ? (
              <p className="text-base mt-4">Записано в раздел «Долги»</p>
            ) : mode.change != null ? (
              <ReadoutPanel className="mt-4" label="Сдача" value={money0(mode.change)} tone="fresh" size="xl" />
            ) : null}
            <p className="text-sm text-ink-soft mt-5">Экран очистится сам · нажмите, чтобы продолжить</p>
          </div>
        </div>
      )}
    </div>
  );

  // Программно эмулируем нажатие F-клавиши (для кнопок мышью/тапом)
  function trigger(key: "F2" | "F3") {
    if (!cart.length) return;
    const method: PaymentMethod = key === "F2" ? "CASH" : "TRANSFER";
    setMode({ t: "payment", method });
  }
}

function PayBtn({ label, hotkey, onClick, disabled }: { label: string; hotkey: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 sm:flex-none h-14 px-4 sm:px-5 rounded-tag bg-ink text-paper font-app-text font-medium text-lg disabled:opacity-40 hover:brightness-110 active:scale-[0.98] transition"
    >
      {label} <span className="text-xs opacity-60 font-app-mono hidden sm:inline">{hotkey}</span>
    </button>
  );
}

function StatusDot({ status }: { status: "connecting" | "online" | "offline" }) {
  const map = {
    online: { c: "bg-fresh", t: "Синхронизация" },
    connecting: { c: "bg-warn", t: "Подключение…" },
    offline: { c: "bg-stamp", t: "Оффлайн" },
  }[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft" title={`Остатки: ${map.t}`}>
      <span className={`w-2.5 h-2.5 rounded-full ${map.c}`} />
      <span className="hidden md:inline">{map.t}</span>
    </span>
  );
}
