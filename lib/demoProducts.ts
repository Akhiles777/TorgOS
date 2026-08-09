// Демо-каталог для чекбокса на /register («Заполнить демо-товарами»).
// Отдельно от prisma/seed.ts: тот генерирует ещё и 14 дней фейковых продаж
// для локальной разработки — здесь только сами товары, без единой выдуманной
// продажи (у нового реального магазина не может быть истории, которой не было).
import { makeEan13, internalBarcode } from "./ean13";

export type DemoProduct = {
  name: string;
  category: string;
  price: number; // рубли
  costPrice: number;
  unit: "PCS" | "KG";
  stock: number;
  barcode: string | null;
  showInPos: boolean;
};

type Row = { name: string; category: string; price: number; cost: number; unit: "PCS" | "KG"; stock: number; noBarcode?: boolean };

const ROWS: Row[] = [
  { name: "Чай «Азерчай» чёрный 250 г", category: "Чай и кофе", price: 285, cost: 210, unit: "PCS", stock: 12 },
  { name: "Кофе молотый «Жокей» 250 г", category: "Чай и кофе", price: 310, cost: 235, unit: "PCS", stock: 10 },
  { name: "Сыр чанах", category: "Молочное и сыры", price: 780, cost: 620, unit: "KG", stock: 4 },
  { name: "Творог домашний", category: "Молочное и сыры", price: 340, cost: 260, unit: "KG", stock: 3 },
  { name: "Молоко «Махачкалинское» 1 л", category: "Молочное и сыры", price: 89, cost: 68, unit: "PCS", stock: 15 },
  { name: "Урбеч из семян льна 250 г", category: "Урбеч и мёд", price: 260, cost: 180, unit: "PCS", stock: 8 },
  { name: "Мёд горный майский 500 г", category: "Урбеч и мёд", price: 480, cost: 350, unit: "PCS", stock: 6 },
  { name: "Самса с говядиной", category: "Выпечка", price: 95, cost: 60, unit: "PCS", stock: 6 },
  { name: "Чуду с зеленью", category: "Выпечка", price: 120, cost: 75, unit: "PCS", stock: 6 },
  { name: "Лепёшка тандырная", category: "Выпечка", price: 45, cost: 25, unit: "PCS", stock: 10 },
  { name: "Курзе с мясом (заморозка)", category: "Выпечка", price: 320, cost: 230, unit: "PCS", stock: 8 },
  { name: "Лаваш тонкий", category: "Выпечка", price: 55, cost: 35, unit: "PCS", stock: 15 },
  { name: "Пахлава медовая", category: "Конфеты и сладости", price: 180, cost: 115, unit: "PCS", stock: 7 },
  { name: "Халва подсолнечная", category: "Конфеты и сладости", price: 240, cost: 165, unit: "KG", stock: 3 },
  { name: "Помидоры бакинские", category: "Овощи и фрукты", price: 350, cost: 270, unit: "KG", stock: 6, noBarcode: true },
  { name: "Огурцы грунтовые", category: "Овощи и фрукты", price: 160, cost: 110, unit: "KG", stock: 5, noBarcode: true },
  { name: "Картофель", category: "Овощи и фрукты", price: 55, cost: 38, unit: "KG", stock: 20, noBarcode: true },
  { name: "Рис длиннозёрный (развес)", category: "Бакалея", price: 95, cost: 70, unit: "KG", stock: 15 },
  { name: "Масло подсолнечное 1 л", category: "Бакалея", price: 135, cost: 104, unit: "PCS", stock: 12 },
  { name: "Вода «Рычал-Су» 1 л", category: "Напитки", price: 75, cost: 52, unit: "PCS", stock: 20 },
];

export function demoProducts(): DemoProduct[] {
  let internalSeq = 1;
  return ROWS.map((r, i) => ({
    name: r.name,
    category: r.category,
    price: r.price,
    costPrice: r.cost,
    unit: r.unit,
    stock: r.stock,
    // PCS — «настоящий» EAN-13 (демо-диапазон 461…), развесное без штрихкода — внутренний код
    barcode: r.noBarcode ? null : r.unit === "KG" ? internalBarcode(internalSeq++) : makeEan13("461" + String(100000000 + i * 3109).padStart(9, "0")),
    showInPos: !!r.noBarcode || r.unit === "KG" || r.name.includes("Вода"),
  }));
}
