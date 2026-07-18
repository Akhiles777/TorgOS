"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Receipt } from "./Receipt";
import { Tiles } from "./Tiles";
import { WeightModal } from "./WeightModal";
import { PaymentModal } from "./PaymentModal";
import { useStockSocket } from "./useStockSocket";
import { money0 } from "@/lib/format";
import { logoutAction } from "@/app/logout/action";
import { startShiftAction } from "@/app/pos/actions";
import type { StockUpdate } from "@/server/realtime";
import type { CartLine, PaymentMethod, PosProduct } from "./types";

type Flash = { kind: "add" | "error"; text: string } | null;
type Mode =
  | { t: "idle" }
  | { t: "weight"; product: PosProduct }
  | { t: "payment"; method: PaymentMethod }
  | { t: "done"; change: number | null; number: number };

let keyCounter = 0;
const nextKey = () => `l${++keyCounter}`;

type ShiftEmployee = { id: string; name: string };

export function PosScreen({
  initialProducts,
  accountName,
  employees,
  currentShift,
}: {
  initialProducts: PosProduct[];
  accountName: string;
  employees: ShiftEmployee[];
  currentShift: ShiftEmployee | null;
}) {
  const [products] = useState(initialProducts);
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

  const scannerRef = useRef<HTMLInputElement>(null);
  const scanBuf = useRef("");
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productsRef = useRef(products);

  const total = cart.reduce((s, l) => s + l.price * l.quantity, 0);
  const modalOpen = mode.t === "weight" || mode.t === "payment";

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
        showFlash({ kind: "error", text: `Штрихкод ${code} не найден` });
        return;
      }
      addProduct(found);
    },
    [addProduct, showFlash],
  );

  const clearCart = useCallback(() => {
    setCart([]);
    setSearch("");
  }, []);

  const doPay = useCallback(
    async (method: PaymentMethod, cashGiven: number | null) => {
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
          setMode({ t: "done", change: data.changeGiven, number: data.number });
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
      if (mode.t === "weight") return; // модалка веса ловит свои клавиши
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
  }, [mode, cart, busy, clearCart, showFlash]);

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
    <div className="flex flex-col lg:flex-row h-[100dvh] overflow-hidden">
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
      <main className="flex-1 flex flex-col min-w-0 p-4 gap-3">
        <header className="flex items-center gap-3 shrink-0">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию…"
            className="flex-1 h-11 px-3 bg-paper border border-line rounded-tag focus:border-ink"
          />
          <StatusDot status={socketStatus} />
          {/* Кто на смене — тап открывает пикер (пересменка среди дня) */}
          {employees.length > 0 && (
            <button
              onClick={() => setPickingShift(true)}
              className="h-9 px-3 inline-flex items-center gap-1.5 rounded-tag border border-line text-sm hover:border-ink transition-colors"
              title="Сменить, кто на смене"
            >
              <span className="text-ink-soft hidden sm:inline">Смена:</span>
              <span className="font-medium">{shift ? shift.name : "выбрать"}</span>
              <span className="text-ink-soft">⟳</span>
            </button>
          )}
          <span className="text-sm text-ink-soft hidden lg:block">{accountName}</span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="h-9 px-3 grid place-items-center rounded-tag border border-line text-ink-soft text-sm hover:text-stamp hover:border-stamp transition-colors"
            >
              Выйти
            </button>
          </form>
        </header>

        <div className="flex-1 min-h-0">
          <Tiles products={liveProducts} stock={stock} query={search} onPick={(p) => addProduct(p)} />
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
            className="h-14 px-5 rounded-tag border border-line text-ink-soft hover:text-stamp hover:border-stamp disabled:opacity-40 transition-colors"
          >
            Очистить <span className="text-xs opacity-60">Del</span>
          </button>
        </footer>
      </main>

      {/* Флеш-уведомление сканера — различимо боковым зрением */}
      {flash && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-40 px-5 py-3 rounded-tag border-2 font-medium shadow-lg ${
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
        <div className="fixed inset-0 z-[60] bg-ink/50 grid place-items-center p-4">
          <div className="bg-paper rounded-tag border border-line shadow-2xl p-6 w-[min(94vw,460px)]">
            <h2 className="text-2xl font-semibold text-center">Кто на смене?</h2>
            <p className="text-ink-soft text-sm text-center mt-1 mb-5">Нажмите своё имя — продажи запишутся на вас.</p>
            <div className="grid gap-2.5">
              {employees.map((e) => (
                <button
                  key={e.id}
                  onClick={() => chooseShift(e)}
                  disabled={shiftBusy}
                  className={`min-h-16 px-5 rounded-tag border-2 text-xl font-semibold transition active:scale-[0.98] disabled:opacity-50 ${
                    shift?.id === e.id ? "border-fresh bg-fresh/10 text-fresh" : "border-line bg-paper-2 hover:border-ink"
                  }`}
                >
                  {e.name}
                </button>
              ))}
            </div>
            {shift && (
              <button
                onClick={() => setPickingShift(false)}
                className="w-full mt-4 h-11 rounded-tag border border-line text-ink-soft hover:border-ink"
              >
                Отмена
              </button>
            )}
          </div>
        </div>
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
        <div className="fixed inset-0 z-50 bg-ink/40 grid place-items-center p-4" onClick={() => setMode({ t: "idle" })}>
          <div className="bg-paper rounded-tag border border-line shadow-2xl px-10 py-8 text-center">
            <div className="stamp inline-block px-5 py-2 text-2xl font-bold mb-4">Пробито</div>
            <p className="text-ink-soft">Чек №{mode.number}</p>
            {mode.change != null && (
              <>
                <p className="text-ink-soft uppercase tracking-wide text-sm mt-4">Сдача</p>
                <p className="font-mono-nums font-bold text-6xl tabular-nums text-fresh">{money0(mode.change)}<span className="text-3xl"> ₽</span></p>
              </>
            )}
            <p className="text-xs text-ink-soft mt-5">Экран очистится сам · нажмите, чтобы продолжить</p>
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
      className="h-14 px-5 rounded-tag bg-ink text-paper font-medium disabled:opacity-40 hover:brightness-110 active:scale-[0.98] transition"
    >
      {label} <span className="text-xs opacity-60 font-mono-nums">{hotkey}</span>
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
