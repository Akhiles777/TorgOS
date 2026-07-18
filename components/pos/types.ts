import type { PosProduct } from "@/server/services/pos";

export type { PosProduct };

export type CartLine = {
  key: string; // уникальный ключ строки (для дробных развесных — своя строка на каждое взвешивание)
  productId: string;
  name: string;
  unit: "PCS" | "KG";
  price: number;
  quantity: number;
};

// Касса принимает только наличные и перевод — карту не берём.
// (В БД тип платежа шире — Prisma.PaymentMethod включает CARD для истории
// старых чеков, но с кассы новый платёж картой создать нельзя.)
export type PaymentMethod = "CASH" | "TRANSFER";
