"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, EmptyState, Badge, Field, ConfirmDialog } from "@/components/ui";
import { Overlay } from "@/components/pos/WeightModal";
import { money0, qty, unitLabel } from "@/lib/format";
import type { RecipeOwnerSummary, RecipeLineDetail } from "@/server/services/horeca/costing";
import type { ProductRow } from "@/server/services/products";
import { addRecipeLineAction, removeRecipeLineAction, setRecipeLineQuantityAction, setSemiFinishedAction } from "./actions";

export function RecipesScreen({
  dishes, semiProducts, ingredients, activeKey, lines,
}: {
  dishes: RecipeOwnerSummary[];
  semiProducts: RecipeOwnerSummary[];
  ingredients: ProductRow[];
  activeKey: string | null;
  lines: RecipeLineDetail[];
}) {
  const router = useRouter();
  const [, startAction] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [unmarkTarget, setUnmarkTarget] = useState<RecipeOwnerSummary | null>(null);

  const activeOwner = [...dishes, ...semiProducts].find((o) => activeKey === `${o.kind === "dish" ? "item" : "semi"}:${o.id}`) ?? null;
  const activeOwnerParam = activeOwner ? (activeOwner.kind === "dish" ? { menuItemId: activeOwner.id } : { ownerProductId: activeOwner.id }) : null;

  const select = (o: RecipeOwnerSummary) => router.push(`/admin/recipes?${o.kind === "dish" ? "item" : "semi"}=${o.id}`);

  const confirmUnmark = () => {
    if (!unmarkTarget) return;
    const t = unmarkTarget;
    setUnmarkTarget(null);
    startAction(async () => {
      await setSemiFinishedAction(t.id, false);
      if (activeKey === `semi:${t.id}`) router.push("/admin/recipes");
      else router.refresh();
    });
  };

  const totalCost = lines.reduce((s, l) => s + l.lineCost, 0);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Рецепты</h1>
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* Левая колонка — владельцы рецептов */}
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium text-ink-soft mb-2">Блюда</div>
            {dishes.length === 0 ? (
              <p className="text-xs text-ink-soft">Блюд пока нет — добавьте на вкладке «Меню».</p>
            ) : (
              <div className="space-y-1.5">
                {dishes.map((d) => (
                  <OwnerRow key={d.id} owner={d} active={activeKey === `item:${d.id}`} onClick={() => select(d)} />
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-ink-soft">Полуфабрикаты</span>
              <Button variant="line" size="md" className="!h-8 !px-2.5 !text-xs" onClick={() => setPickerOpen(true)}>+ Полуфабрикат</Button>
            </div>
            {semiProducts.length === 0 ? (
              <p className="text-xs text-ink-soft">Полуфабрикатов пока нет — тесто, соус, сироп и т.п.</p>
            ) : (
              <div className="space-y-1.5">
                {semiProducts.map((p) => (
                  <OwnerRow key={p.id} owner={p} active={activeKey === `semi:${p.id}`} onClick={() => select(p)} onUnmark={() => setUnmarkTarget(p)} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Правая колонка — строки рецепта выбранного владельца */}
        <div>
          {!activeOwner || !activeOwnerParam ? (
            <EmptyState>Выберите блюдо или полуфабрикат слева, чтобы редактировать рецепт.</EmptyState>
          ) : (
            <RecipeDetail owner={activeOwner} ownerParam={activeOwnerParam} ingredients={ingredients} lines={lines} totalCost={totalCost} />
          )}
        </div>
      </div>

      {pickerOpen && (
        <SemiFinishedPicker
          ingredients={ingredients.filter((p) => !p.isSemiFinished)}
          onClose={() => setPickerOpen(false)}
          onPicked={(id) => { setPickerOpen(false); router.push(`/admin/recipes?semi=${id}`); }}
        />
      )}
      <ConfirmDialog
        open={!!unmarkTarget}
        title={`Снять «${unmarkTarget?.name}» с полуфабрикатов?`}
        body="Строки рецепта сохранятся (можно включить обратно), но себестоимость перестанет пересчитываться автоматически."
        confirmLabel="Снять"
        danger={false}
        onConfirm={confirmUnmark}
        onCancel={() => setUnmarkTarget(null)}
      />
    </div>
  );
}

function OwnerRow({
  owner, active, onClick, onUnmark,
}: { owner: RecipeOwnerSummary; active: boolean; onClick: () => void; onUnmark?: () => void }) {
  return (
    <div className={`flex items-center gap-2 rounded-tag border px-2.5 py-2 cursor-pointer ${active ? "border-ink bg-paper-2" : "border-line hover:bg-paper-2/60"}`} onClick={onClick}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{owner.name}</div>
        <div className="text-xs text-ink-soft">
          {owner.cost != null ? `${money0(owner.cost)} ₽` : "рецепт не задан"} · {owner.lineCount} ингр.
        </div>
      </div>
      {onUnmark && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onUnmark(); }}
          title="Снять с полуфабрикатов"
          aria-label="Снять с полуфабрикатов"
          className="w-6 h-6 shrink-0 grid place-items-center rounded-tag text-ink-soft hover:text-stamp-text hover:bg-paper"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function RecipeDetail({
  owner, ownerParam, ingredients, lines, totalCost,
}: {
  owner: RecipeOwnerSummary;
  ownerParam: { menuItemId: string } | { ownerProductId: string };
  ingredients: ProductRow[];
  lines: RecipeLineDetail[];
  totalCost: number;
}) {
  const router = useRouter();
  const [, startAction] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [pending, start] = useTransition();

  const availableIngredients = ingredients.filter((p) => p.id !== ("ownerProductId" in ownerParam ? ownerParam.ownerProductId : ""));
  const markupPct = owner.kind === "dish" && owner.price != null && totalCost > 0 ? Math.round(((owner.price - totalCost) / totalCost) * 100) : null;

  const submitLine = (fd: FormData) => {
    if ("menuItemId" in ownerParam) fd.set("menuItemId", ownerParam.menuItemId);
    else fd.set("ownerProductId", ownerParam.ownerProductId);
    start(async () => {
      const res = await addRecipeLineAction(null, fd);
      if (res.ok) { setProductId(""); setQuantity(""); setError(null); router.refresh(); }
      else setError(res.error);
    });
  };

  const removeLine = (id: string) => startAction(async () => { await removeRecipeLineAction(id); router.refresh(); });
  const changeQty = (id: string, value: string) => {
    const n = parseFloat(value.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return;
    startAction(async () => { await setRecipeLineQuantityAction(id, n); router.refresh(); });
  };

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold">{owner.name}</h2>
          <p className="text-xs text-ink-soft">{owner.kind === "dish" ? "Рецепт блюда" : "Рецепт полуфабриката — количество на 1 " + unitLabelFor(owner, ingredients)}</p>
        </div>
        {owner.kind === "dish" && owner.price != null && (
          <div className="text-right">
            <div className="font-app-mono">{money0(owner.price)} ₽</div>
            {markupPct != null && <Badge tone={markupPct < 100 ? "warn" : "fresh"}>наценка {markupPct}%</Badge>}
          </div>
        )}
      </div>

      {lines.length === 0 ? (
        <EmptyState className="mb-3">Ингредиентов пока нет — добавьте первый ниже.</EmptyState>
      ) : (
        <div className="border border-line rounded-tag overflow-hidden mb-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paper-2 text-ink-soft text-left">
                <th className="px-3 py-2 font-medium">Ингредиент</th>
                <th className="px-3 py-2 font-medium text-right">Количество</th>
                <th className="px-3 py-2 font-medium text-right">Цена/ед.</th>
                <th className="px-3 py-2 font-medium text-right">Стоимость</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-t border-line">
                  <td className="px-3 py-2">
                    {l.productName}
                    {l.productIsSemiFinished && <Badge tone="line">п/ф</Badge>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="text"
                      inputMode="decimal"
                      defaultValue={String(l.quantity)}
                      onBlur={(e) => changeQty(l.id, e.currentTarget.value)}
                      className="w-24 h-8 px-2 text-right bg-paper border border-line rounded-tag font-app-mono focus:border-ink"
                    />
                    <span className="text-ink-soft text-xs ml-1">{unitLabel(l.productUnit)}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-app-mono text-ink-soft">{money0(l.ingredientCostPrice)}</td>
                  <td className="px-3 py-2 text-right font-app-mono">{money0(l.lineCost)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => removeLine(l.id)}
                      title="Удалить ингредиент"
                      aria-label="Удалить ингредиент"
                      className="w-7 h-7 grid place-items-center rounded-tag border border-stamp/40 text-stamp-text hover:bg-stamp hover:text-stamp-ink"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-paper-2 font-medium">
                <td className="px-3 py-2" colSpan={3}>Итого себестоимость</td>
                <td className="px-3 py-2 text-right font-app-mono">{money0(totalCost)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <form action={submitLine} className="flex flex-wrap items-end gap-2 bg-paper-2 border border-line rounded-tag p-3">
        <label className="block flex-1 min-w-[180px]">
          <span className="block text-xs text-ink-soft mb-1">Ингредиент</span>
          <select
            name="productId"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="w-full h-10 px-2 bg-paper border border-line rounded-tag focus:border-ink"
          >
            <option value="">Выберите…</option>
            {availableIngredients.map((p) => <option key={p.id} value={p.id}>{p.name}{p.isSemiFinished ? " (п/ф)" : ""}</option>)}
          </select>
        </label>
        <label className="block w-28">
          <span className="block text-xs text-ink-soft mb-1">Количество</span>
          <input
            name="quantity"
            type="text"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/[^\d.,]/g, ""))}
            className="w-full h-10 px-2 bg-paper border border-line rounded-tag font-app-mono focus:border-ink"
          />
        </label>
        <Button type="submit" variant="stamp" disabled={pending || !productId || !quantity}>{pending ? "…" : "Добавить"}</Button>
      </form>
      {error && <p className="text-stamp-text text-sm mt-2">{error}</p>}
    </div>
  );
}

function unitLabelFor(owner: RecipeOwnerSummary, ingredients: ProductRow[]): string {
  // Полуфабрикат сам Product — берём его unit из общего списка товаров.
  const p = ingredients.find((i) => i.id === owner.id);
  return p ? unitLabel(p.unit) : "ед.";
}

function SemiFinishedPicker({
  ingredients, onClose, onPicked,
}: { ingredients: ProductRow[]; onClose: () => void; onPicked: (id: string) => void }) {
  const [, startAction] = useTransition();
  const [q, setQ] = useState("");
  const filtered = ingredients.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));

  const pick = (id: string) => startAction(async () => { await setSemiFinishedAction(id, true); onPicked(id); });

  return (
    <Overlay onCancel={onClose}>
      <div className="w-[min(94vw,420px)]">
        <h2 className="text-xl font-semibold mb-3">Отметить товар полуфабрикатом</h2>
        <Field placeholder="Поиск…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" autoFocus />
        <div className="max-h-[50vh] overflow-y-auto space-y-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-ink-soft py-4 text-center">Ничего не найдено. Все товары нужно сперва завести на вкладке «Товары».</p>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => pick(p.id)}
                className="w-full text-left px-3 py-2 rounded-tag border border-line hover:border-ink hover:bg-paper-2"
              >
                {p.name} <span className="text-ink-soft text-xs">· {qty(p.stock, p.unit)} {unitLabel(p.unit)}</span>
              </button>
            ))
          )}
        </div>
        <Button variant="line" size="lg" className="w-full mt-3" onClick={onClose}>Закрыть</Button>
      </div>
    </Overlay>
  );
}
