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

export type PaymentMethod = "CASH" | "CARD" | "TRANSFER";
