"use client";
// Те же самохостинг-шрифты, что и у розничной кассы (см. PosScreen.tsx) —
// единый визуальный язык кассы независимо от режима.
import "@fontsource-variable/unbounded/wght.css";
import "@fontsource-variable/golos-text/wght.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import { useCallback, useEffect, useState } from "react";
import { Receipt } from "@/components/pos/Receipt";
import { PaymentModal, type DebtInfo } from "@/components/pos/PaymentModal";
import { Modal, ReadoutPanel } from "@/components/ui";
import { money0 } from "@/lib/format";
import { logoutAction } from "@/app/logout/action";
import { endImpersonationAction } from "@/app/impersonate/actions";
import { startShiftAction } from "@/app/pos/actions";
import { saveOpenOrderAction, cancelOpenOrderAction, loadOpenOrdersAction, loadOpenOrderAction } from "@/app/pos/horeca/actions";
import { MenuGrid } from "./MenuGrid";
import { ModifierModal } from "./ModifierModal";
import type { PosMenuCategory, PosMenuItem, PosModifier, OpenOrderRow } from "@/server/services/horeca/pos";
import type { DraftLine } from "@/server/services/horeca/types";
import type { CartLine, PaymentMethod } from "@/components/pos/types";

type Flash = { kind: "add" | "error"; text: string } | null;
type Mode =
  | { t: "idle" }
  | { t: "payment"; method: PaymentMethod }
  | { t: "done"; change: number | null; number: number; debt: boolean; warnings: string[] };

let keyCounter = 0;
const nextKey = () => `h${++keyCounter}`;

type ShiftEmployee = { id: string; name: string };
// Расширяем CartLine (для переиспользования Receipt как есть) полями,
// нужными только общепиту: исходное блюдо и выбранные модификаторы.
type HorecaCartLine = CartLine & { menuItemId: string; modifiers: PosModifier[] };

export function HorecaPosScreen({
  menu,
  initialOpenOrders,
  storeName,
  accountName,
  employees,
  currentShift,
  impersonating,
}: {
  menu: { categories: PosMenuCategory[]; items: PosMenuItem[] };
  initialOpenOrders: OpenOrderRow[];
  storeName: string;
  accountName: string;
  employees: ShiftEmployee[];
  currentShift: ShiftEmployee | null;
  impersonating?: boolean;
}) {
  const [cart, setCart] = useState<HorecaCartLine[]>([]);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [openOrders, setOpenOrders] = useState(initialOpenOrders);
  const [mode, setMode] = useState<Mode>({ t: "idle" });
  const [flash, setFlash] = useState<Flash>(null);
  const [tearing, setTearing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shift, setShift] = useState<ShiftEmployee | null>(currentShift);
  const [pickingShift, setPickingShift] = useState(employees.length > 0 && !currentShift);
  const [shiftBusy, setShiftBusy] = useState(false);
  const [modifierPickerItem, setModifierPickerItem] = useState<PosMenuItem | null>(null);

  const total = cart.reduce((s, l) => s + l.price * l.quantity, 0);

  const showFlash = useCallback((f: Flash) => {
    setFlash(f);
    const t = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(t);
  }, []);

  const refreshOpenOrders = useCallback(() => {
    loadOpenOrdersAction().then(setOpenOrders).catch(() => {});
  }, []);

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

  const clearCart = useCallback(() => {
    setCart([]);
    setActiveOrderId(null);
  }, []);

  const addItem = useCallback((item: PosMenuItem, modifiers: PosModifier[]) => {
    const unitPrice = item.price + modifiers.reduce((s, m) => s + m.priceDelta, 0);
    const modKey = [...modifiers.map((m) => m.id)].sort().join(",");
    const displayName = modifiers.length ? `${item.name} (${modifiers.map((m) => m.name).join(", ")})` : item.name;
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.menuItemId === item.id && [...l.modifiers.map((m) => m.id)].sort().join(",") === modKey);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, {
        key: nextKey(), productId: item.id, menuItemId: item.id, name: displayName,
        unit: "PCS" as const, price: unitPrice, quantity: 1, modifiers,
      }];
    });
    showFlash({ kind: "add", text: displayName });
  }, [showFlash]);

  const handlePick = (item: PosMenuItem) => {
    if (item.modifierGroups.length > 0) setModifierPickerItem(item);
    else addItem(item, []);
  };

  const incLine = (key: string) => setCart((prev) => prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l)));
  const decLine = (key: string) => setCart((prev) => prev.flatMap((l) => {
    if (l.key !== key) return [l];
    return l.quantity > 1 ? [{ ...l, quantity: l.quantity - 1 }] : [];
  }));
  const removeLine = (key: string) => setCart((prev) => prev.filter((l) => l.key !== key));

  const toDraftLines = useCallback((): DraftLine[] =>
    cart.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, modifierIds: l.modifiers.map((m) => m.id) })), [cart]);

  const doPay = useCallback(async (method: PaymentMethod, cashGiven: number | null, debt: DebtInfo | null) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/horeca/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(activeOrderId ? { orderId: activeOrderId } : { lines: toDraftLines() }),
          paymentMethod: method, cashGiven, isDebt: !!debt,
          debtorName: debt?.debtorName || null, debtorContact: debt?.debtorContact || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showFlash({ kind: "error", text: data.error ?? "Ошибка оплаты" });
        setBusy(false);
        return;
      }
      setTearing(true);
      setTimeout(() => {
        setTearing(false);
        clearCart();
        setMode({ t: "done", change: data.changeGiven, number: data.number, debt: !!debt, warnings: data.warnings ?? [] });
        setBusy(false);
        refreshOpenOrders();
        setTimeout(() => setMode((m) => (m.t === "done" ? { t: "idle" } : m)), 3500);
      }, 460);
    } catch {
      showFlash({ kind: "error", text: "Нет связи с сервером" });
      setBusy(false);
    }
  }, [busy, activeOrderId, toDraftLines, clearCart, showFlash, refreshOpenOrders]);

  const doDefer = async () => {
    if (!cart.length || busy) return;
    setBusy(true);
    const res = await saveOpenOrderAction(activeOrderId, toDraftLines());
    setBusy(false);
    if (res.ok) {
      clearCart();
      refreshOpenOrders();
      showFlash({ kind: "add", text: "Заказ отложен" });
    } else {
      showFlash({ kind: "error", text: res.error });
    }
  };

  const resumeOrder = async (orderId: string) => {
    if (cart.length) {
      showFlash({ kind: "error", text: "Сначала завершите текущий чек" });
      return;
    }
    const detail = await loadOpenOrderAction(orderId);
    if (!detail) {
      showFlash({ kind: "error", text: "Заказ не найден — возможно, уже оплачен" });
      refreshOpenOrders();
      return;
    }
    setCart(detail.items.map((it) => {
      const mods = it.modifiers ?? [];
      const displayName = mods.length ? `${it.name} (${mods.map((m) => m.name).join(", ")})` : it.name;
      const modifiers: PosModifier[] = mods.map((m) => ({
        id: m.modifierId, name: m.name, priceDelta: m.priceDelta,
        addProductId: m.addProductId, addQuantity: m.addQuantity, replacesProductId: m.replacesProductId,
      }));
      return {
        key: nextKey(), productId: it.menuItemId, menuItemId: it.menuItemId, name: displayName,
        unit: "PCS" as const, price: it.priceAtSale, quantity: it.quantity, modifiers,
      };
    }));
    setActiveOrderId(orderId);
  };

  const cancelActiveOrThis = async (orderId: string) => {
    const res = await cancelOpenOrderAction(orderId);
    if (res.ok) {
      if (activeOrderId === orderId) clearCart();
      refreshOpenOrders();
    } else {
      showFlash({ kind: "error", text: res.error });
    }
  };

  // Горячие клавиши — F2/F3 оплата, Delete очистить (та же схема, что в рознице).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode.t !== "idle") return;
      if (["F2", "F3"].includes(e.key)) {
        e.preventDefault();
        if (!cart.length) { showFlash({ kind: "error", text: "Чек пуст" }); return; }
        setMode({ t: "payment", method: e.key === "F2" ? "CASH" : "TRANSFER" });
      } else if (e.key === "Delete" && cart.length) {
        e.preventDefault();
        clearCart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, cart, clearCart, showFlash]);

  return (
    <div className="flex flex-col lg:flex-row h-[100dvh] overflow-hidden font-app-text text-lg">
      {impersonating && (
        <div className="fixed top-0 inset-x-0 z-40 bg-warn text-ink px-3 py-1.5 text-xs flex items-center justify-between gap-2">
          <span>Вход как {accountName} через root</span>
          <form action={endImpersonationAction}>
            <button type="submit" className="h-6 px-2 rounded-tag bg-ink text-paper text-xs font-medium">Вернуться</button>
          </form>
        </div>
      )}

      <aside className="lg:w-[440px] w-full lg:h-full h-[45vh] shrink-0 border-b lg:border-b-0 lg:border-r border-line bg-paper relative">
        <Receipt
          lines={cart}
          total={total}
          tearing={tearing}
          onInc={incLine}
          onDec={decLine}
          onRemove={removeLine}
          title={`ТоргОС · ${storeName}`}
          emptyStateHint="Выберите блюдо на плитке"
        />
      </aside>

      <main className="flex-1 flex flex-col min-w-0 p-3 sm:p-4 gap-2.5 sm:gap-3">
        <header className="flex items-center gap-2 sm:gap-3 shrink-0 flex-wrap">
          <span className="text-lg font-semibold mr-auto">Касса</span>
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
            <button type="submit" className="h-14 px-3.5 grid place-items-center rounded-tag border border-line text-ink-soft text-base hover:text-stamp-text hover:border-stamp transition-colors">
              Выйти
            </button>
          </form>
        </header>

        {openOrders.length > 0 && (
          <div className="shrink-0 overflow-x-auto -mx-1 px-1">
            <div className="flex gap-2">
              {openOrders.map((o) => (
                <div key={o.id} className={`shrink-0 flex items-center gap-2 rounded-tag border px-3 h-12 ${activeOrderId === o.id ? "border-ink bg-paper-2" : "border-line"}`}>
                  <button onClick={() => resumeOrder(o.id)} className="text-sm font-medium">
                    №{o.number} · {o.itemCount} поз. · {money0(o.total)} ₽
                  </button>
                  <button onClick={() => cancelActiveOrThis(o.id)} title="Отменить заказ" aria-label="Отменить заказ" className="text-ink-soft hover:text-stamp-text text-sm">✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0">
          <MenuGrid categories={menu.categories} items={menu.items} onPick={handlePick} />
        </div>

        <footer className="shrink-0 grid grid-cols-[1fr_auto_auto] gap-3 items-center">
          <div className="flex gap-2">
            <PayBtn label="Наличные" hotkey="F2" onClick={() => cart.length && setMode({ t: "payment", method: "CASH" })} disabled={!cart.length} />
            <PayBtn label="Перевод" hotkey="F3" onClick={() => cart.length && setMode({ t: "payment", method: "TRANSFER" })} disabled={!cart.length} />
          </div>
          <button
            onClick={doDefer}
            disabled={!cart.length || busy}
            className="h-14 px-3.5 sm:px-5 rounded-tag border border-line hover:border-ink disabled:opacity-40 transition-colors"
          >
            Отложить
          </button>
          <button
            onClick={() => cart.length && clearCart()}
            disabled={!cart.length}
            className="h-14 px-3.5 sm:px-5 rounded-tag border border-line text-ink-soft hover:text-stamp-text hover:border-stamp disabled:opacity-40 transition-colors"
          >
            Очистить <span className="text-xs opacity-60 hidden sm:inline">Del</span>
          </button>
        </footer>
      </main>

      {flash && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-40 px-5 py-3 rounded-tag border-2 font-medium text-lg shadow-lg ${
            flash.kind === "add" ? "bg-fresh text-stamp-ink border-fresh" : "bg-stamp text-stamp-ink border-stamp animate-shake"
          }`}
          role="status"
        >
          {flash.kind === "add" ? "✓ " : "✕ "}{flash.text}
        </div>
      )}

      {/* Пикер смены — та же логика/разметка, что в рознице (см. PosScreen.tsx),
          намеренно продублирована, а не вынесена: розничная касса не трогается вообще. */}
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
              <button onClick={() => setPickingShift(false)} className="w-full mt-4 h-14 rounded-tag border border-line text-ink-soft hover:border-ink">
                Отмена
              </button>
            )}
          </div>
        </Modal>
      )}

      {modifierPickerItem && (
        <ModifierModal
          item={modifierPickerItem}
          onConfirm={(selected) => { addItem(modifierPickerItem, selected); setModifierPickerItem(null); }}
          onCancel={() => setModifierPickerItem(null)}
        />
      )}

      {mode.t === "payment" && (
        <PaymentModal total={total} initialMethod={mode.method} busy={busy} onPay={doPay} onCancel={() => setMode({ t: "idle" })} />
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
            {mode.warnings.length > 0 && (
              <div className="mt-4 bg-warn/10 border border-warn/40 rounded-tag p-3 text-left text-sm text-warn-text">
                {mode.warnings.map((w, i) => <p key={i}>{w}</p>)}
              </div>
            )}
            <p className="text-sm text-ink-soft mt-5">Экран очистится сам · нажмите, чтобы продолжить</p>
          </div>
        </div>
      )}
    </div>
  );
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
