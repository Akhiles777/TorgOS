// EAN-13: генерация контрольной цифры, валидация, внутренние коды для развесных.

export function ean13CheckDigit(digits12: string): string {
  if (!/^\d{12}$/.test(digits12)) throw new Error(`Ожидается 12 цифр, получено: ${digits12}`);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(digits12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10);
}

export function makeEan13(digits12: string): string {
  return digits12 + ean13CheckDigit(digits12);
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === code[12];
}

// Внутренний штрихкод для развесных/безштрихкодовых товаров.
// Префикс «2» зарезервирован GS1 под внутреннее использование магазина;
// формат: 2 0 + 10 цифр порядкового номера + контрольная цифра.
export function internalBarcode(seq: number): string {
  return makeEan13("20" + String(seq).padStart(10, "0"));
}

export function isInternalBarcode(code: string): boolean {
  return isValidEan13(code) && code.startsWith("2");
}
