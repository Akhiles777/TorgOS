// Штрихкоды: EAN-13 (основной формат) и EAN-8 (короткий, для мелкой упаковки —
// конфеты, жвачка и т.п.; это отдельный настоящий стандарт GS1, а не «сломанный»
// EAN-13). Обе длины — контрольная цифра, валидация, внутренние коды.

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

// EAN-8: те же принципы, но 7 значащих цифр + 1 контрольная. Вес чередуется
// в обратную сторону относительно EAN-13 (3,1,3,1,3,1,3 начиная с первой).
export function ean8CheckDigit(digits7: string): string {
  if (!/^\d{7}$/.test(digits7)) throw new Error(`Ожидается 7 цифр, получено: ${digits7}`);
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    sum += Number(digits7[i]) * (i % 2 === 0 ? 3 : 1);
  }
  return String((10 - (sum % 10)) % 10);
}

export function makeEan8(digits7: string): string {
  return digits7 + ean8CheckDigit(digits7);
}

export function isValidEan8(code: string): boolean {
  return /^\d{8}$/.test(code) && ean8CheckDigit(code.slice(0, 7)) === code[7];
}

// Штрихкод товара — валиден, если это корректный EAN-13 ИЛИ корректный EAN-8.
// Раньше принимали только 13 знаков и отклоняли настоящие EAN-8 с ошибкой
// «должен быть 13 цифр» — это и был баг: EAN-8 не «неполный EAN-13», а другой,
// тоже стандартный формат.
export function isValidBarcode(code: string): boolean {
  return isValidEan13(code) || isValidEan8(code);
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
