// Наполняет демо-данными HORECA-организацию при регистрации (чекбокс
// «Заполнить демо-товарами» на /register) — ингредиенты → полуфабрикат со
// своим рецептом → блюда с рецептами и одной группой модификаторов.
// Вызывается ВНУТРИ транзакции регистрации (сырой prisma.$transaction —
// организации ещё не существует, tenantDb здесь неприменим и не нужен:
// все id генерируются этой же функцией, чужих данных тут просто нет).
import { Prisma } from "@prisma/client";
import { demoHoreca } from "@/lib/demoHoreca";

type Tx = Prisma.TransactionClient;
const dec = (n: number, places = 2) => new Prisma.Decimal(n.toFixed(places));

export async function seedHorecaDemo(tx: Tx, storeId: string): Promise<void> {
  const data = demoHoreca();
  const productIdByKey = new Map<string, string>();
  const costByKey = new Map<string, number>();

  for (const ing of data.ingredients) {
    const p = await tx.product.create({
      data: { storeId, name: ing.name, category: ing.category, unit: ing.unit, price: dec(0), costPrice: dec(ing.costPrice), stock: dec(ing.stock, 3) },
      select: { id: true },
    });
    productIdByKey.set(ing.key, p.id);
    costByKey.set(ing.key, ing.costPrice);
  }

  for (const semi of data.semiFinished) {
    const p = await tx.product.create({
      data: { storeId, name: semi.name, category: semi.category, unit: semi.unit, price: dec(0), costPrice: dec(0), stock: dec(semi.stock, 3), isSemiFinished: true },
      select: { id: true },
    });
    productIdByKey.set(semi.key, p.id);

    let cost = 0;
    for (const line of semi.recipe) {
      await tx.recipeLine.create({ data: { ownerProductId: p.id, productId: productIdByKey.get(line.ingredientKey)!, quantity: dec(line.quantity, 3) } });
      cost += (costByKey.get(line.ingredientKey) ?? 0) * line.quantity;
    }
    costByKey.set(semi.key, cost);
    await tx.product.update({ where: { id: p.id }, data: { costPrice: dec(cost) } });
  }

  const categoryIdByName = new Map<string, string>();
  for (let i = 0; i < data.categories.length; i++) {
    const c = await tx.menuCategory.create({ data: { storeId, name: data.categories[i], position: i }, select: { id: true } });
    categoryIdByName.set(data.categories[i], c.id);
  }

  for (const dish of data.dishes) {
    const item = await tx.menuItem.create({
      data: { storeId, categoryId: categoryIdByName.get(dish.categoryName) ?? null, name: dish.name, price: dec(dish.price) },
      select: { id: true },
    });

    let cost = 0;
    for (const line of dish.recipe) {
      await tx.recipeLine.create({ data: { menuItemId: item.id, productId: productIdByKey.get(line.ingredientKey)!, quantity: dec(line.quantity, 3) } });
      cost += (costByKey.get(line.ingredientKey) ?? 0) * line.quantity;
    }
    await tx.menuItem.update({ where: { id: item.id }, data: { cachedCost: dec(cost), cachedCostAt: new Date() } });

    if (dish.modifierGroup) {
      const group = await tx.modifierGroup.create({
        data: { storeId, name: dish.modifierGroup.name, isRequired: dish.modifierGroup.isRequired, maxChoices: dish.modifierGroup.maxChoices },
        select: { id: true },
      });
      await tx.menuItemModifierGroup.create({ data: { menuItemId: item.id, groupId: group.id } });
      for (const mod of dish.modifierGroup.modifiers) {
        await tx.modifier.create({
          data: {
            groupId: group.id, name: mod.name, priceDelta: dec(mod.priceDelta),
            addProductId: mod.addIngredientKey ? productIdByKey.get(mod.addIngredientKey) : null,
            addQuantity: mod.addQuantity != null ? dec(mod.addQuantity, 3) : null,
            replacesProductId: mod.replacesIngredientKey ? productIdByKey.get(mod.replacesIngredientKey) : null,
          },
        });
      }
    }
  }
}
