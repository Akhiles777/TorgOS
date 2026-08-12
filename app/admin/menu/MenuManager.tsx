"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, SegmentedControl, EmptyState, ConfirmDialog, Modal, Field, DecimalField, Badge } from "@/components/ui";
import { Overlay } from "@/components/pos/WeightModal";
import { money0 } from "@/lib/format";
import type { MenuCategoryRow, MenuItemRow, ModifierGroupRow, ModifierRow } from "@/server/services/horeca/menu";
import type { ProductRow } from "@/server/services/products";
import {
  saveCategoryAction, deleteCategoryAction, moveCategoryAction,
  saveMenuItemAction, toggleMenuItemActiveAction, deleteMenuItemAction, moveMenuItemAction,
  saveModifierGroupAction, deleteModifierGroupAction, saveModifierAction, deleteModifierAction,
} from "./actions";

type View = "items" | "categories" | "modifiers";

export function MenuManager({
  categories, items, groups, ingredients,
}: { categories: MenuCategoryRow[]; items: MenuItemRow[]; groups: ModifierGroupRow[]; ingredients: ProductRow[] }) {
  const [view, setView] = useState<View>("items");

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="text-xl font-semibold w-full sm:w-auto sm:mr-auto">Меню</h1>
        <SegmentedControl
          value={view}
          onChange={setView}
          options={[
            { value: "items", label: `Блюда · ${items.length}` },
            { value: "categories", label: `Категории · ${categories.length}` },
            { value: "modifiers", label: `Модификаторы · ${groups.length}` },
          ]}
        />
      </div>
      {view === "items" && <ItemsView categories={categories} items={items} groups={groups} />}
      {view === "categories" && <CategoriesView categories={categories} />}
      {view === "modifiers" && <ModifiersView groups={groups} ingredients={ingredients} />}
    </div>
  );
}

// ── Блюда ────────────────────────────────────────────────────────────────
function ItemsView({ categories, items, groups }: { categories: MenuCategoryRow[]; items: MenuItemRow[]; groups: ModifierGroupRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<MenuItemRow | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MenuItemRow | null>(null);
  const [deactivateOffer, setDeactivateOffer] = useState<{ item: MenuItemRow; reason: string } | null>(null);
  const [, startAction] = useTransition();

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const it = deleteTarget;
    setDeleteTarget(null);
    startAction(async () => {
      const res = await deleteMenuItemAction(it.id);
      if (res.ok) { router.refresh(); return; }
      setDeactivateOffer({ item: it, reason: res.error });
    });
  };
  const confirmDeactivate = () => {
    if (!deactivateOffer) return;
    const it = deactivateOffer.item;
    setDeactivateOffer(null);
    startAction(async () => { await toggleMenuItemActiveAction(it.id, false); router.refresh(); });
  };
  const restore = (it: MenuItemRow) => startAction(async () => { await toggleMenuItemActiveAction(it.id, true); router.refresh(); });
  const move = (it: MenuItemRow, dir: "up" | "down") => startAction(async () => { await moveMenuItemAction(it.id, dir); router.refresh(); });

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button variant="stamp" onClick={() => setEditing("new")}>+ Блюдо</Button>
      </div>
      {items.length === 0 ? (
        <EmptyState>Блюд пока нет — добавьте первое.</EmptyState>
      ) : (
        <div className="overflow-x-auto border border-line rounded-tag">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-paper-2 text-ink-soft text-left">
                <th className="px-3 py-2 font-medium">Блюдо</th>
                <th className="px-3 py-2 font-medium">Категория</th>
                <th className="px-3 py-2 font-medium text-right">Цена</th>
                <th className="px-3 py-2 font-medium text-right">Себестоимость</th>
                <th className="px-3 py-2 font-medium text-right">Наценка</th>
                <th className="px-3 py-2 font-medium text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className={`border-t border-line hover:bg-paper-2/50 ${!it.isActive ? "opacity-50" : ""}`}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{it.name}</div>
                    {it.description && <div className="text-xs text-ink-soft">{it.description}</div>}
                  </td>
                  <td className="px-3 py-2 text-ink-soft">{it.categoryName ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-app-mono">{money0(it.price)}</td>
                  <td className="px-3 py-2 text-right font-app-mono text-ink-soft">
                    {it.cachedCost == null ? (
                      <span className="text-ink-soft/70 italic">рецепт не задан</span>
                    ) : (
                      <>
                        {money0(it.cachedCost)}
                        {it.foodCostPct != null && <span className="block text-[11px]">фудкост {it.foodCostPct}%</span>}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-app-mono">
                    {it.markupPct != null ? (
                      <span className={it.markupPct < 100 ? "text-stamp-text" : "text-fresh-text"}>{it.markupPct}%</span>
                    ) : (
                      <span className="text-ink-soft">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 justify-end items-center">
                      <IconBtn onClick={() => move(it, "up")} title="Выше">↑</IconBtn>
                      <IconBtn onClick={() => move(it, "down")} title="Ниже">↓</IconBtn>
                      <IconBtn onClick={() => setEditing(it)} title="Редактировать">✎</IconBtn>
                      {!it.isActive && <IconBtn onClick={() => restore(it)} title="Вернуть в продажу">↩</IconBtn>}
                      <span className="w-px h-6 bg-line mx-1.5 shrink-0" aria-hidden />
                      <IconBtn onClick={() => setDeleteTarget(it)} title="Удалить блюдо" danger>✕</IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <MenuItemModal item={editing === "new" ? null : editing} categories={categories} groups={groups} onClose={() => setEditing(null)} />
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        title={`Удалить «${deleteTarget?.name}» из меню?`}
        body="Отменить будет нельзя."
        confirmLabel="Удалить"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <ConfirmDialog
        open={!!deactivateOffer}
        title={`Снять «${deactivateOffer?.item.name}» с продажи?`}
        body={`${deactivateOffer?.reason} Блюдо останется в меню, но пропадёт с кассы.`}
        confirmLabel="Снять с продажи"
        danger={false}
        onConfirm={confirmDeactivate}
        onCancel={() => setDeactivateOffer(null)}
      />
    </div>
  );
}

function MenuItemModal({
  item, categories, groups, onClose,
}: { item: MenuItemRow | null; categories: MenuCategoryRow[]; groups: ModifierGroupRow[]; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set(item?.modifierGroupIds ?? []));

  const onSubmit = (fd: FormData) => {
    for (const id of selectedGroups) fd.append("modifierGroupIds", id);
    start(async () => {
      const res = await saveMenuItemAction(null, fd);
      if (res.ok) { onClose(); router.refresh(); } else setError(res.error);
    });
  };

  return (
    <Overlay onCancel={onClose}>
      <form action={onSubmit} className="w-[min(94vw,520px)] space-y-3">
        <h2 className="text-xl font-semibold">{item ? "Редактировать блюдо" : "Новое блюдо"}</h2>
        {item && <input type="hidden" name="id" value={item.id} />}
        <Field name="name" label="Название" defaultValue={item?.name} required autoFocus />
        <label className="block">
          <span className="block text-sm text-ink-soft mb-1">Описание (необязательно)</span>
          <textarea
            name="description"
            defaultValue={item?.description ?? ""}
            rows={2}
            className="w-full px-3 py-2 bg-paper border border-line rounded-tag focus:border-ink resize-none"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <DecimalField name="price" label="Цена, ₽" defaultValue={item?.price != null ? String(item.price) : ""} required />
          <label className="block">
            <span className="block text-sm text-ink-soft mb-1">Категория</span>
            <select name="categoryId" defaultValue={item?.categoryId ?? ""} className="w-full h-11 px-3 bg-paper border border-line rounded-tag focus:border-ink">
              <option value="">Без категории</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>
        <div>
          <span className="block text-sm text-ink-soft mb-1.5">Группы модификаторов</span>
          {groups.length === 0 ? (
            <p className="text-xs text-ink-soft">Групп пока нет — создайте на вкладке «Модификаторы».</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => {
                const active = selectedGroups.has(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedGroups((prev) => {
                      const next = new Set(prev);
                      if (next.has(g.id)) next.delete(g.id); else next.add(g.id);
                      return next;
                    })}
                    className={`px-3 h-9 rounded-tag border text-sm font-medium transition-colors ${
                      active ? "bg-ink text-paper border-ink" : "bg-paper border-line hover:bg-paper-2"
                    }`}
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {error && <p className="text-stamp-text text-sm">{error}</p>}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button type="button" variant="line" size="lg" onClick={onClose}>Отмена</Button>
          <Button type="submit" variant="stamp" size="lg" disabled={pending}>{pending ? "Сохраняем…" : "Сохранить"}</Button>
        </div>
      </form>
    </Overlay>
  );
}

// ── Категории ────────────────────────────────────────────────────────────
function CategoriesView({ categories }: { categories: MenuCategoryRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<MenuCategoryRow | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MenuCategoryRow | null>(null);
  const [, startAction] = useTransition();

  const move = (c: MenuCategoryRow, dir: "up" | "down") => startAction(async () => { await moveCategoryAction(c.id, dir); router.refresh(); });
  const confirmDelete = () => {
    if (!deleteTarget) return;
    const c = deleteTarget;
    setDeleteTarget(null);
    startAction(async () => { await deleteCategoryAction(c.id); router.refresh(); });
  };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button variant="stamp" onClick={() => setEditing("new")}>+ Категория</Button>
      </div>
      {categories.length === 0 ? (
        <EmptyState>Категорий пока нет.</EmptyState>
      ) : (
        <div className="space-y-2">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-3 border border-line rounded-tag bg-paper-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-ink-soft">{c.itemCount} блюд</div>
              </div>
              <IconBtn onClick={() => move(c, "up")} title="Выше">↑</IconBtn>
              <IconBtn onClick={() => move(c, "down")} title="Ниже">↓</IconBtn>
              <IconBtn onClick={() => setEditing(c)} title="Переименовать">✎</IconBtn>
              <IconBtn onClick={() => setDeleteTarget(c)} title="Удалить категорию" danger>✕</IconBtn>
            </div>
          ))}
        </div>
      )}
      {editing && <CategoryModal category={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleteTarget}
        title={`Удалить категорию «${deleteTarget?.name}»?`}
        body={deleteTarget && deleteTarget.itemCount > 0 ? `${deleteTarget.itemCount} блюд станут «Без категории» — сами блюда не удаляются.` : "Отменить будет нельзя."}
        confirmLabel="Удалить"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function CategoryModal({ category, onClose }: { category: MenuCategoryRow | null; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const onSubmit = (fd: FormData) => {
    start(async () => {
      const res = await saveCategoryAction(null, fd);
      if (res.ok) { onClose(); router.refresh(); } else setError(res.error);
    });
  };
  return (
    <Overlay onCancel={onClose}>
      <form action={onSubmit} className="w-[min(92vw,380px)] space-y-3">
        <h2 className="text-xl font-semibold">{category ? "Переименовать категорию" : "Новая категория"}</h2>
        {category && <input type="hidden" name="id" value={category.id} />}
        <Field name="name" label="Название" defaultValue={category?.name} required autoFocus />
        {error && <p className="text-stamp-text text-sm">{error}</p>}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button type="button" variant="line" size="lg" onClick={onClose}>Отмена</Button>
          <Button type="submit" variant="stamp" size="lg" disabled={pending}>{pending ? "Сохраняем…" : "Сохранить"}</Button>
        </div>
      </form>
    </Overlay>
  );
}

// ── Модификаторы ─────────────────────────────────────────────────────────
function ModifiersView({ groups, ingredients }: { groups: ModifierGroupRow[]; ingredients: ProductRow[] }) {
  const router = useRouter();
  const [editingGroup, setEditingGroup] = useState<ModifierGroupRow | "new" | null>(null);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<ModifierGroupRow | null>(null);
  const [editingModifier, setEditingModifier] = useState<{ groupId: string; modifier: ModifierRow | "new" } | null>(null);
  const [deleteModifierTarget, setDeleteModifierTarget] = useState<ModifierRow | null>(null);
  const [, startAction] = useTransition();

  const confirmDeleteGroup = () => {
    if (!deleteGroupTarget) return;
    const g = deleteGroupTarget;
    setDeleteGroupTarget(null);
    startAction(async () => { await deleteModifierGroupAction(g.id); router.refresh(); });
  };
  const confirmDeleteModifier = () => {
    if (!deleteModifierTarget) return;
    const m = deleteModifierTarget;
    setDeleteModifierTarget(null);
    startAction(async () => { await deleteModifierAction(m.id); router.refresh(); });
  };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button variant="stamp" onClick={() => setEditingGroup("new")}>+ Группа модификаторов</Button>
      </div>
      {groups.length === 0 ? (
        <EmptyState>Групп модификаторов пока нет — добавьте, например, «Молоко» или «Размер».</EmptyState>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.id} className="border border-line rounded-tag bg-paper-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {g.name}
                    {g.isRequired && <Badge tone="warn">обязательна</Badge>}
                    <Badge tone="line">до {g.maxChoices}</Badge>
                  </div>
                  <div className="text-xs text-ink-soft mt-0.5">используется в {g.usedByCount} блюдах</div>
                </div>
                <div className="flex gap-1 items-center shrink-0">
                  <IconBtn onClick={() => setEditingGroup(g)} title="Редактировать группу">✎</IconBtn>
                  <IconBtn onClick={() => setDeleteGroupTarget(g)} title="Удалить группу" danger>✕</IconBtn>
                </div>
              </div>
              <div className="mt-2.5 space-y-1.5">
                {g.modifiers.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-2 bg-paper border border-line rounded-tag px-2.5 py-1.5 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium">{m.name}</span>
                      {m.priceDelta !== 0 && <span className="font-app-mono text-ink-soft ml-2">{m.priceDelta > 0 ? "+" : ""}{money0(m.priceDelta)}</span>}
                      {m.addProductName && <span className="block text-xs text-ink-soft">+ {m.addQuantity} {m.addProductName}</span>}
                      {m.replacesProductName && <span className="block text-xs text-ink-soft">вместо {m.replacesProductName}</span>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <IconBtn onClick={() => setEditingModifier({ groupId: g.id, modifier: m })} title="Редактировать">✎</IconBtn>
                      <IconBtn onClick={() => setDeleteModifierTarget(m)} title="Удалить" danger>✕</IconBtn>
                    </div>
                  </div>
                ))}
                <Button variant="line" size="md" className="w-full mt-1" onClick={() => setEditingModifier({ groupId: g.id, modifier: "new" })}>
                  + Модификатор
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingGroup && <ModifierGroupModal group={editingGroup === "new" ? null : editingGroup} onClose={() => setEditingGroup(null)} />}
      {editingModifier && (
        <ModifierModal
          groupId={editingModifier.groupId}
          modifier={editingModifier.modifier === "new" ? null : editingModifier.modifier}
          ingredients={ingredients}
          onClose={() => setEditingModifier(null)}
        />
      )}
      <ConfirmDialog
        open={!!deleteGroupTarget}
        title={`Удалить группу «${deleteGroupTarget?.name}»?`}
        body={deleteGroupTarget && deleteGroupTarget.usedByCount > 0 ? `Группа используется в ${deleteGroupTarget.usedByCount} блюдах — они её лишатся. Прошлые чеки не изменятся.` : "Отменить будет нельзя."}
        confirmLabel="Удалить"
        onConfirm={confirmDeleteGroup}
        onCancel={() => setDeleteGroupTarget(null)}
      />
      <ConfirmDialog
        open={!!deleteModifierTarget}
        title={`Удалить модификатор «${deleteModifierTarget?.name}»?`}
        confirmLabel="Удалить"
        onConfirm={confirmDeleteModifier}
        onCancel={() => setDeleteModifierTarget(null)}
      />
    </div>
  );
}

function ModifierGroupModal({ group, onClose }: { group: ModifierGroupRow | null; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const onSubmit = (fd: FormData) => {
    start(async () => {
      const res = await saveModifierGroupAction(null, fd);
      if (res.ok) { onClose(); router.refresh(); } else setError(res.error);
    });
  };
  return (
    <Overlay onCancel={onClose}>
      <form action={onSubmit} className="w-[min(92vw,420px)] space-y-3">
        <h2 className="text-xl font-semibold">{group ? "Редактировать группу" : "Новая группа модификаторов"}</h2>
        {group && <input type="hidden" name="id" value={group.id} />}
        <Field name="name" label="Название (например «Молоко»)" defaultValue={group?.name} required autoFocus />
        <label className="block">
          <span className="block text-sm text-ink-soft mb-1">Максимум выборов</span>
          <input name="maxChoices" type="number" min={1} defaultValue={group?.maxChoices ?? 1} className="w-full h-11 px-3 bg-paper border border-line rounded-tag focus:border-ink" />
        </label>
        <label className="flex items-center gap-2.5 bg-paper-2 border border-line rounded-tag p-3 cursor-pointer">
          <input type="checkbox" name="isRequired" defaultChecked={group?.isRequired ?? false} className="w-5 h-5 accent-stamp" />
          <span className="text-sm">Выбор обязателен (нельзя добавить блюдо без выбора)</span>
        </label>
        {error && <p className="text-stamp-text text-sm">{error}</p>}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button type="button" variant="line" size="lg" onClick={onClose}>Отмена</Button>
          <Button type="submit" variant="stamp" size="lg" disabled={pending}>{pending ? "Сохраняем…" : "Сохранить"}</Button>
        </div>
      </form>
    </Overlay>
  );
}

function ModifierModal({
  groupId, modifier, ingredients, onClose,
}: { groupId: string; modifier: ModifierRow | null; ingredients: ProductRow[]; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [addProductId, setAddProductId] = useState(modifier?.addProductId ?? "");

  const onSubmit = (fd: FormData) => {
    fd.set("groupId", groupId);
    start(async () => {
      const res = await saveModifierAction(null, fd);
      if (res.ok) { onClose(); router.refresh(); } else setError(res.error);
    });
  };
  return (
    <Overlay onCancel={onClose}>
      <form action={onSubmit} className="w-[min(94vw,460px)] space-y-3">
        <h2 className="text-xl font-semibold">{modifier ? "Редактировать модификатор" : "Новый модификатор"}</h2>
        {modifier && <input type="hidden" name="id" value={modifier.id} />}
        <Field name="name" label="Название (например «Овсяное»)" defaultValue={modifier?.name} required autoFocus />
        <DecimalField name="priceDelta" label="Доплата, ₽ (0 если бесплатно)" defaultValue={modifier?.priceDelta != null ? String(modifier.priceDelta) : "0"} />
        <label className="block">
          <span className="block text-sm text-ink-soft mb-1">Заменяет ингредиент рецепта (необязательно)</span>
          <select name="replacesProductId" defaultValue={modifier?.replacesProductId ?? ""} className="w-full h-11 px-3 bg-paper border border-line rounded-tag focus:border-ink">
            <option value="">— не заменяет —</option>
            {ingredients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-sm text-ink-soft mb-1">Добавляет ингредиент сверх рецепта (необязательно)</span>
          <select name="addProductId" value={addProductId} onChange={(e) => setAddProductId(e.target.value)} className="w-full h-11 px-3 bg-paper border border-line rounded-tag focus:border-ink">
            <option value="">— не добавляет —</option>
            {ingredients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        {addProductId && (
          <DecimalField name="addQuantity" label="Количество добавляемого ингредиента" defaultValue={modifier?.addQuantity != null ? String(modifier.addQuantity) : ""} required />
        )}
        {error && <p className="text-stamp-text text-sm">{error}</p>}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button type="button" variant="line" size="lg" onClick={onClose}>Отмена</Button>
          <Button type="submit" variant="stamp" size="lg" disabled={pending}>{pending ? "Сохраняем…" : "Сохранить"}</Button>
        </div>
      </form>
    </Overlay>
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
