// Сид: организация «Гастроном», одна точка, три сотрудника,
// 42 товара и 14 дней реалистичных продаж (дашборд владельца и
// «Рекомендации ИИ» считаются из этих чеков, никаких фейков в UI).
import { PrismaClient, Unit, PaymentMethod, MovementType, Prisma } from "@prisma/client";
import { hashSync } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { makeEan13, internalBarcode } from "../lib/ean13";

const prisma = new PrismaClient();

// Детерминированный RNG, чтобы сид был воспроизводимым
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260717);
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

type SeedProduct = {
  name: string;
  category: string;
  price: number; // рубли
  cost: number;
  unit: Unit;
  stock: number;
  expiryDays?: number; // срок годности через N дней от сегодня
  weight: number; // популярность в продажах (0 = не продаётся, для инсайта)
  noBarcode?: boolean; // овощи и т.п. — только через плитки
};

// weight подобраны так, чтобы в инсайтах честно всплыли:
// «Сок гранатовый» — ни одной продажи за 14 дней;
// «Самса с говядиной» — продаётся быстрее, чем остаток позволяет;
// «Хлеб формовой» — маржа ниже порога;
// «Творог домашний» — срок годности через 2 дня.
const PRODUCTS: SeedProduct[] = [
  { name: "Чай «Азерчай» чёрный 250 г", category: "Чай и кофе", price: 285, cost: 210, unit: "PCS", stock: 24, weight: 4 },
  { name: "Чай зелёный «Ахмад» 100 пак.", category: "Чай и кофе", price: 320, cost: 240, unit: "PCS", stock: 15, weight: 2 },
  { name: "Кофе молотый «Жокей» 250 г", category: "Чай и кофе", price: 310, cost: 235, unit: "PCS", stock: 18, weight: 2 },
  { name: "Сыр чанах", category: "Молочное и сыры", price: 780, cost: 620, unit: "KG", stock: 9.4, weight: 6 },
  { name: "Брынза сербская", category: "Молочное и сыры", price: 650, cost: 520, unit: "KG", stock: 6.2, weight: 4 },
  { name: "Сулугуни", category: "Молочное и сыры", price: 720, cost: 580, unit: "KG", stock: 5.5, weight: 4 },
  { name: "Творог домашний", category: "Молочное и сыры", price: 340, cost: 260, unit: "KG", stock: 4.8, expiryDays: 2, weight: 5 },
  { name: "Сметана 25% 400 г", category: "Молочное и сыры", price: 145, cost: 108, unit: "PCS", stock: 22, expiryDays: 6, weight: 6 },
  { name: "Молоко «Махачкалинское» 1 л", category: "Молочное и сыры", price: 89, cost: 68, unit: "PCS", stock: 30, expiryDays: 4, weight: 10 },
  { name: "Масло сливочное 82,5% 180 г", category: "Молочное и сыры", price: 215, cost: 172, unit: "PCS", stock: 17, weight: 4 },
  { name: "Урбеч из семян льна 250 г", category: "Урбеч и мёд", price: 260, cost: 180, unit: "PCS", stock: 14, weight: 3 },
  { name: "Урбеч из абрикосовых косточек 250 г", category: "Урбеч и мёд", price: 340, cost: 240, unit: "PCS", stock: 11, weight: 2 },
  { name: "Урбеч из грецкого ореха 250 г", category: "Урбеч и мёд", price: 420, cost: 310, unit: "PCS", stock: 8, weight: 2 },
  { name: "Мёд горный майский 500 г", category: "Урбеч и мёд", price: 480, cost: 350, unit: "PCS", stock: 10, weight: 2 },
  { name: "Самса с говядиной", category: "Выпечка", price: 95, cost: 60, unit: "PCS", stock: 6, expiryDays: 1, weight: 14 },
  { name: "Чуду с зеленью", category: "Выпечка", price: 120, cost: 75, unit: "PCS", stock: 9, expiryDays: 1, weight: 8 },
  { name: "Лепёшка тандырная", category: "Выпечка", price: 45, cost: 25, unit: "PCS", stock: 20, expiryDays: 1, weight: 12 },
  { name: "Хлеб формовой", category: "Выпечка", price: 38, cost: 33, unit: "PCS", stock: 25, expiryDays: 2, weight: 15 },
  { name: "Пирожки с картошкой", category: "Выпечка", price: 55, cost: 32, unit: "PCS", stock: 12, expiryDays: 1, weight: 7 },
  { name: "Конфеты «Птичье молоко»", category: "Конфеты и сладости", price: 520, cost: 410, unit: "KG", stock: 7.3, weight: 4 },
  { name: "Конфеты «Барбарис»", category: "Конфеты и сладости", price: 280, cost: 195, unit: "KG", stock: 5.1, weight: 3 },
  { name: "Ирис «Кис-кис»", category: "Конфеты и сладости", price: 260, cost: 185, unit: "KG", stock: 4.4, weight: 2 },
  { name: "Халва подсолнечная", category: "Конфеты и сладости", price: 240, cost: 165, unit: "KG", stock: 6.8, weight: 3 },
  { name: "Пахлава медовая", category: "Конфеты и сладости", price: 180, cost: 115, unit: "PCS", stock: 9, expiryDays: 5, weight: 4 },
  { name: "Помидоры бакинские", category: "Овощи и фрукты", price: 350, cost: 270, unit: "KG", stock: 12.0, weight: 8, noBarcode: true },
  { name: "Огурцы грунтовые", category: "Овощи и фрукты", price: 160, cost: 110, unit: "KG", stock: 10.5, weight: 7, noBarcode: true },
  { name: "Зелень (кинза), пучок", category: "Овощи и фрукты", price: 35, cost: 18, unit: "PCS", stock: 30, expiryDays: 2, weight: 9, noBarcode: true },
  { name: "Картофель", category: "Овощи и фрукты", price: 55, cost: 38, unit: "KG", stock: 48.0, weight: 10, noBarcode: true },
  { name: "Лук репчатый", category: "Овощи и фрукты", price: 42, cost: 28, unit: "KG", stock: 35.0, weight: 6, noBarcode: true },
  { name: "Яблоки «Симиренко»", category: "Овощи и фрукты", price: 130, cost: 92, unit: "KG", stock: 22.0, weight: 7, noBarcode: true },
  { name: "Хурма", category: "Овощи и фрукты", price: 220, cost: 165, unit: "KG", stock: 8.0, weight: 4, noBarcode: true },
  { name: "Рис длиннозёрный (развес)", category: "Бакалея", price: 95, cost: 70, unit: "KG", stock: 40.0, weight: 5 },
  { name: "Мука в/с 2 кг", category: "Бакалея", price: 118, cost: 88, unit: "PCS", stock: 26, weight: 5 },
  { name: "Макароны «Шебекинские» 450 г", category: "Бакалея", price: 92, cost: 64, unit: "PCS", stock: 33, weight: 5 },
  { name: "Масло подсолнечное 1 л", category: "Бакалея", price: 135, cost: 104, unit: "PCS", stock: 28, weight: 7 },
  { name: "Вода «Рычал-Су» 1 л", category: "Напитки", price: 75, cost: 52, unit: "PCS", stock: 40, weight: 9 },
  { name: "Лимонад «Денеб» Тархун 1 л", category: "Напитки", price: 88, cost: 60, unit: "PCS", stock: 36, weight: 8 },
  { name: "Сок гранатовый 1 л", category: "Напитки", price: 210, cost: 150, unit: "PCS", stock: 16, weight: 0 },
  { name: "Колбаса говяжья сыровяленая", category: "Мясное", price: 890, cost: 720, unit: "KG", stock: 4.2, weight: 3 },
  { name: "Курага", category: "Сухофрукты и орехи", price: 420, cost: 320, unit: "KG", stock: 6.5, weight: 4 },
  { name: "Чернослив", category: "Сухофрукты и орехи", price: 380, cost: 290, unit: "KG", stock: 5.8, weight: 3 },
  { name: "Грецкий орех очищенный", category: "Сухофрукты и орехи", price: 950, cost: 750, unit: "KG", stock: 3.6, weight: 2 },
];

const d2 = (n: number) => new Prisma.Decimal(n.toFixed(2));
const d3 = (n: number) => new Prisma.Decimal(n.toFixed(3));

// Логины. Пароли можно переопределить через env, иначе — эти дефолты.
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD || "gasan777";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "admin123";

async function main() {
  console.log("Очищаю базу…");
  await prisma.$transaction([
    prisma.saleItem.deleteMany(),
    prisma.sale.deleteMany(),
    prisma.stockMovement.deleteMany(),
    prisma.product.deleteMany(),
    prisma.supplier.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
    prisma.store.deleteMany(),
    prisma.organization.deleteMany(),
  ]);
  // Сбрасываем нумерацию чеков, чтобы демо начиналось с №1
  await prisma.$executeRawUnsafe('ALTER SEQUENCE "Sale_number_seq" RESTART WITH 1');

  const org = await prisma.organization.create({
    data: { name: "Гастроном", type: "RETAIL", plan: "TRIAL" },
  });
  const store = await prisma.store.create({
    data: {
      organizationId: org.id,
      name: "Гастроном на Ирчи Казака",
      address: "Махачкала, ул. Ирчи Казака, 31",
    },
  });

  // Алункачев Гасан — владелец (кабинет + админка + касса).
  const owner = await prisma.user.create({
    data: {
      organizationId: org.id, storeId: store.id, role: "OWNER",
      name: "Алункачев Гасан", login: "gasan", passwordHash: hashSync(OWNER_PASSWORD, 10),
    },
  });
  // Общий логин администратора точки (админка + касса, без кабинета владельца).
  await prisma.user.create({
    data: {
      organizationId: org.id, storeId: store.id, role: "ADMIN",
      name: "Администратор", login: "admin", passwordHash: hashSync(ADMIN_PASSWORD, 10),
    },
  });

  // Сотрудники смены — НЕ логины. Касса работает под аккаунтом Гасана, а «кто
  // на смене» выбирается тапом (раз в сутки, граница 07:00 МСК). Продажи
  // записываются на выбранного сотрудника.
  const [empZemfira, empRita] = await Promise.all([
    prisma.employee.create({ data: { storeId: store.id, name: "Земфира Абдуллаева" }, select: { id: true } }),
    prisma.employee.create({ data: { storeId: store.id, name: "Рита Юсупова" }, select: { id: true } }),
  ]);
  await prisma.employee.create({ data: { storeId: store.id, name: "Гасан (сам)" } });
  const shiftEmployees = [empZemfira, empRita];

  // SEED_EMPTY=1 — «боевой чистый старт»: организация, точка, один логин Гасана
  // и сотрудники смены. Ни товаров, ни поставщиков, ни продаж — каталог с нуля.
  if (process.env.SEED_EMPTY) {
    console.log("Готово (пустой старт): организация, точка, логин gasan и сотрудники смены. Каталог пустой.");
    console.log("Логины: gasan (владелец) и admin (администратор). Земфира и Рита — смена на кассе, без логинов.");
    return;
  }

  await prisma.supplier.createMany({
    data: [
      { storeId: store.id, name: "База «Дагпродукт»", phone: "+7 928 500-11-22", notes: "Овощи, фрукты, зелень — привоз вт и пт" },
      { storeId: store.id, name: "Кизлярские колбасы", phone: "+7 963 400-77-10", notes: "Колбаса, отсрочка 7 дней" },
      { storeId: store.id, name: "Пекарня у Расула", phone: "+7 989 650-33-44", notes: "Самса, чуду, лепёшки — каждое утро к 7:30" },
    ],
  });

  console.log("Создаю товары…");
  const now = new Date();
  const dayMs = 86_400_000;
  let internalSeq = 1;
  const products = PRODUCTS.map((p, i) => ({
    id: randomUUID(),
    storeId: store.id,
    // PCS — «настоящий» EAN-13 (формат 460…, РФ), развесные — внутренний «2X»,
    // овощи — вовсе без штрихкода: продаются с плиток
    barcode: p.noBarcode ? null : p.unit === "KG" ? internalBarcode(internalSeq++) : makeEan13("460" + String(700000000 + i * 5717).padStart(9, "0")),
    name: p.name,
    price: d2(p.price),
    costPrice: d2(p.cost),
    unit: p.unit,
    category: p.category,
    expiry: p.expiryDays != null ? new Date(now.getTime() + p.expiryDays * dayMs) : null,
    stock: d3(p.stock),
    isActive: true,
  }));
  await prisma.product.createMany({ data: products });

  // SEED_NO_HISTORY=1 — режим для реального продакшена: организация, точка,
  // сотрудники и каталог товаров создаются как обычно, но БЕЗ 14 дней
  // выдуманных продаж. Кабинет владельца и «Рекомендации» стартуют честно
  // с нуля и наполняются по мере настоящих чеков.
  const noHistory = !!process.env.SEED_NO_HISTORY;

  type SaleRow = { id: string; storeId: string; cashierId: string; employeeId: string; total: Prisma.Decimal; paymentMethod: PaymentMethod; cashGiven: Prisma.Decimal | null; changeGiven: Prisma.Decimal | null; createdAt: Date };
  const sales: SaleRow[] = [];
  const saleItems: { id: string; saleId: string; productId: string; quantity: Prisma.Decimal; priceAtSale: Prisma.Decimal }[] = [];
  const movements: { id: string; productId: string; type: MovementType; quantity: Prisma.Decimal; reason: string | null; userId: string; createdAt: Date }[] = [];
  const soldByProduct = new Map<string, number>();

  if (!noHistory) {
    console.log("Генерирую 14 дней продаж…");
    const weighted: number[] = [];
    PRODUCTS.forEach((p, i) => { for (let w = 0; w < p.weight; w++) weighted.push(i); });
    // Утренний и вечерний пики
    const hours = [8, 8, 9, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15, 16, 16, 17, 17, 17, 18, 18, 18, 19, 19, 19, 20, 20];

    for (let dayOffset = 13; dayOffset >= 0; dayOffset--) {
      const receipts = 28 + Math.floor(rand() * 25);
      for (let r = 0; r < receipts; r++) {
        const day = new Date(now.getTime() - dayOffset * dayMs);
        const createdAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), pick(hours), Math.floor(rand() * 60), Math.floor(rand() * 60));
        if (createdAt > now) continue;
        // Логин один (Гасан), а смену держит одна из сотрудниц — чек целиком
        // записывается на неё (реалистичнее, чем случайный человек на позицию).
        const shiftEmp = pick(shiftEmployees);
        const itemCount = 1 + Math.floor(rand() * rand() * 6);
        const chosen = new Set<number>();
        while (chosen.size < itemCount) chosen.add(pick(weighted));
        let total = 0;
        const saleId = randomUUID();
        for (const idx of chosen) {
          const p = PRODUCTS[idx];
          const prod = products[idx];
          const qty = p.unit === "KG" ? Math.round((0.2 + rand() * 1.3) * 200) / 200 : 1 + Math.floor(rand() * 3);
          const lineSum = Math.round(p.price * qty * 100) / 100;
          total = Math.round((total + lineSum) * 100) / 100;
          saleItems.push({ id: randomUUID(), saleId, productId: prod.id, quantity: d3(qty), priceAtSale: d2(p.price) });
          movements.push({ id: randomUUID(), productId: prod.id, type: "OUT", quantity: d3(qty), reason: "продажа", userId: owner.id, createdAt });
          soldByProduct.set(prod.id, (soldByProduct.get(prod.id) ?? 0) + qty);
        }
        // Карту не принимаем — только наличные и перевод (реальный способ оплаты магазина)
        const pm: PaymentMethod = rand() < 0.65 ? "CASH" : "TRANSFER";
        let cashGiven: number | null = null;
        let changeGiven: number | null = null;
        if (pm === "CASH") {
          cashGiven = Math.ceil(total / 100) * 100;
          if (cashGiven - total > 60 && rand() < 0.5) cashGiven = Math.ceil(total / 50) * 50;
          changeGiven = Math.round((cashGiven - total) * 100) / 100;
        }
        sales.push({
          id: saleId, storeId: store.id,
          cashierId: owner.id, employeeId: shiftEmp.id,
          total: d2(total), paymentMethod: pm,
          cashGiven: cashGiven != null ? d2(cashGiven) : null,
          changeGiven: changeGiven != null ? d2(changeGiven) : null,
          createdAt,
        });
      }
    }
    sales.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    await prisma.sale.createMany({ data: sales });
    await prisma.saleItem.createMany({ data: saleItems });
  }

  console.log("Записываю движения товара…");
  const start = new Date(now.getTime() - 14 * dayMs);
  for (const prod of products) {
    const sold = soldByProduct.get(prod.id) ?? 0;
    const initial = Math.round((Number(prod.stock) + sold) * 1000) / 1000;
    movements.push({ id: randomUUID(), productId: prod.id, type: "IN", quantity: d3(initial), reason: "начальный приход", userId: owner.id, createdAt: start });
  }
  if (!noHistory) {
    // Пара честных списаний — только для демо-режима с историей
    const tvorog = products[PRODUCTS.findIndex((p) => p.name === "Творог домашний")];
    const zelen = products[PRODUCTS.findIndex((p) => p.name === "Зелень (кинза), пучок")];
    movements.push({ id: randomUUID(), productId: tvorog.id, type: "WRITEOFF", quantity: d3(1.2), reason: "истёк срок годности", userId: owner.id, createdAt: new Date(now.getTime() - 3 * dayMs) });
    movements.push({ id: randomUUID(), productId: zelen.id, type: "WRITEOFF", quantity: d3(4), reason: "завяла", userId: owner.id, createdAt: new Date(now.getTime() - 1 * dayMs) });
  }
  await prisma.stockMovement.createMany({ data: movements });

  const totalRevenue = sales.reduce((s, x) => s + Number(x.total), 0);
  if (noHistory) {
    console.log(`Готово (без истории): ${products.length} товаров, 0 продаж — чистый старт.`);
  } else {
    console.log(`Готово: ${products.length} товаров, ${sales.length} чеков на ${Math.round(totalRevenue)} ₽, ${saleItems.length} позиций, ${movements.length} движений.`);
  }
  console.log("Логины: gasan (владелец) / admin (администратор). Смена (Земфира/Рита) выбирается на кассе тапом.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
