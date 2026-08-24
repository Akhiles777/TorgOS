// Демо-данные для чекбокса на /register, ветка HORECA («Заполнить демо-товарами»).
// В отличие от lib/demoProducts.ts (розница — плоский список товаров), здесь
// нужна согласованная связка: ингредиенты → полуфабрикат со своим рецептом →
// блюда, использующие и сырьё, и полуфабрикат, → одна группа модификаторов.
// Ключи (key) — только чтобы связать строки друг с другом при заполнении
// (создание Product → RecipeLine → MenuItem идёт в несколько проходов, id
// появляются только после первого прохода) — в БД не попадают.
import type { Unit } from "@prisma/client";

export type DemoIngredient = { key: string; name: string; category: string; unit: Unit; costPrice: number; stock: number };
export type DemoSemiFinished = {
  key: string; name: string; category: string; unit: Unit; stock: number;
  recipe: { ingredientKey: string; quantity: number }[];
};
export type DemoDish = {
  name: string; categoryName: string; price: number;
  recipe: { ingredientKey: string; quantity: number }[];
  modifierGroup?: {
    name: string; isRequired: boolean; maxChoices: number;
    modifiers: { name: string; priceDelta: number; addIngredientKey?: string; addQuantity?: number; replacesIngredientKey?: string }[];
  };
};

export type HorecaDemoData = {
  ingredients: DemoIngredient[];
  semiFinished: DemoSemiFinished[];
  categories: string[];
  dishes: DemoDish[];
};

export function demoHoreca(): HorecaDemoData {
  const ingredients: DemoIngredient[] = [
    { key: "milk_cow", name: "Молоко коровье", category: "Сырьё", unit: "L", costPrice: 60, stock: 10 },
    { key: "milk_oat", name: "Молоко овсяное", category: "Сырьё", unit: "L", costPrice: 90, stock: 5 },
    { key: "coffee", name: "Кофе в зёрнах", category: "Сырьё", unit: "KG", costPrice: 900, stock: 2 },
    { key: "sugar", name: "Сахар", category: "Сырьё", unit: "KG", costPrice: 60, stock: 5 },
    { key: "flour", name: "Мука пшеничная", category: "Сырьё", unit: "KG", costPrice: 45, stock: 10 },
    { key: "butter", name: "Масло сливочное", category: "Сырьё", unit: "KG", costPrice: 550, stock: 3 },
    { key: "yeast", name: "Дрожжи", category: "Сырьё", unit: "KG", costPrice: 300, stock: 0.5 },
    { key: "water", name: "Вода", category: "Сырьё", unit: "L", costPrice: 0, stock: 20 },
  ];

  const semiFinished: DemoSemiFinished[] = [
    {
      key: "croissant_dough", name: "Тесто для круассанов", category: "Полуфабрикаты", unit: "KG", stock: 1,
      recipe: [
        { ingredientKey: "flour", quantity: 0.5 },
        { ingredientKey: "butter", quantity: 0.3 },
        { ingredientKey: "water", quantity: 0.15 },
        { ingredientKey: "yeast", quantity: 0.02 },
        { ingredientKey: "sugar", quantity: 0.03 },
      ],
    },
  ];

  const categories = ["Напитки", "Выпечка"];

  const dishes: DemoDish[] = [
    {
      name: "Латте", categoryName: "Напитки", price: 220,
      recipe: [{ ingredientKey: "coffee", quantity: 0.018 }, { ingredientKey: "milk_cow", quantity: 0.2 }],
      modifierGroup: {
        name: "Молоко", isRequired: false, maxChoices: 1,
        modifiers: [{ name: "Овсяное молоко", priceDelta: 30, replacesIngredientKey: "milk_cow", addIngredientKey: "milk_oat", addQuantity: 0.2 }],
      },
    },
    {
      name: "Капучино", categoryName: "Напитки", price: 200,
      recipe: [{ ingredientKey: "coffee", quantity: 0.018 }, { ingredientKey: "milk_cow", quantity: 0.15 }],
    },
    {
      name: "Круассан", categoryName: "Выпечка", price: 150,
      recipe: [{ ingredientKey: "croissant_dough", quantity: 0.08 }],
    },
  ];

  return { ingredients, semiFinished, categories, dishes };
}
