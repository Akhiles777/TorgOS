// Расшифровка префикса GS1 — что можно узнать о штрихкоде БЕСПЛАТНО, не
// обращаясь к ИИ. Первые три цифры EAN-13 говорят, в какой стране
// зарегистрирован производитель (не где произведён товар!), а диапазоны
// 977/978/979 означают периодику и книги.
//
// Зачем это поиску: подсказка «код зарегистрирован в России» заметно сужает
// область поиска модели — российская канцелярия и бытовая химия живут в
// рунет-источниках, а не в международных базах, куда модель идёт по умолчанию.

const RANGES: { from: number; to: number; country: string }[] = [
  { from: 0, to: 19, country: "США или Канаде" },
  { from: 30, to: 39, country: "США" },
  { from: 60, to: 139, country: "США или Канаде" },
  { from: 300, to: 379, country: "Франции" },
  { from: 380, to: 380, country: "Болгарии" },
  { from: 383, to: 383, country: "Словении" },
  { from: 385, to: 385, country: "Хорватии" },
  { from: 400, to: 440, country: "Германии" },
  { from: 450, to: 459, country: "Японии" },
  { from: 460, to: 469, country: "России" },
  { from: 470, to: 470, country: "Киргизии" },
  { from: 471, to: 471, country: "Тайване" },
  { from: 474, to: 474, country: "Эстонии" },
  { from: 475, to: 475, country: "Латвии" },
  { from: 476, to: 476, country: "Азербайджане" },
  { from: 477, to: 477, country: "Литве" },
  { from: 478, to: 478, country: "Узбекистане" },
  { from: 481, to: 481, country: "Белоруссии" },
  { from: 482, to: 482, country: "Украине" },
  { from: 484, to: 484, country: "Молдавии" },
  { from: 485, to: 485, country: "Армении" },
  { from: 486, to: 486, country: "Грузии" },
  { from: 487, to: 487, country: "Казахстане" },
  { from: 488, to: 488, country: "Таджикистане" },
  { from: 489, to: 489, country: "Гонконге" },
  { from: 490, to: 499, country: "Японии" },
  { from: 500, to: 509, country: "Великобритании" },
  { from: 520, to: 521, country: "Греции" },
  { from: 539, to: 539, country: "Ирландии" },
  { from: 540, to: 549, country: "Бельгии или Люксембурге" },
  { from: 560, to: 560, country: "Португалии" },
  { from: 570, to: 579, country: "Дании" },
  { from: 590, to: 590, country: "Польше" },
  { from: 594, to: 594, country: "Румынии" },
  { from: 599, to: 599, country: "Венгрии" },
  { from: 600, to: 601, country: "ЮАР" },
  { from: 611, to: 611, country: "Марокко" },
  { from: 619, to: 619, country: "Тунисе" },
  { from: 626, to: 626, country: "Иране" },
  { from: 628, to: 628, country: "Саудовской Аравии" },
  { from: 629, to: 629, country: "ОАЭ" },
  { from: 640, to: 649, country: "Финляндии" },
  { from: 690, to: 699, country: "Китае" },
  { from: 700, to: 709, country: "Норвегии" },
  { from: 729, to: 729, country: "Израиле" },
  { from: 730, to: 739, country: "Швеции" },
  { from: 750, to: 750, country: "Мексике" },
  { from: 754, to: 755, country: "Канаде" },
  { from: 760, to: 769, country: "Швейцарии" },
  { from: 778, to: 779, country: "Аргентине" },
  { from: 789, to: 790, country: "Бразилии" },
  { from: 800, to: 839, country: "Италии" },
  { from: 840, to: 849, country: "Испании" },
  { from: 858, to: 858, country: "Словакии" },
  { from: 859, to: 859, country: "Чехии" },
  { from: 860, to: 860, country: "Сербии" },
  { from: 868, to: 869, country: "Турции" },
  { from: 870, to: 879, country: "Нидерландах" },
  { from: 880, to: 880, country: "Южной Корее" },
  { from: 885, to: 885, country: "Таиланде" },
  { from: 888, to: 888, country: "Сингапуре" },
  { from: 890, to: 890, country: "Индии" },
  { from: 893, to: 893, country: "Вьетнаме" },
  { from: 899, to: 899, country: "Индонезии" },
  { from: 900, to: 919, country: "Австрии" },
  { from: 930, to: 939, country: "Австралии" },
  { from: 940, to: 949, country: "Новой Зеландии" },
  { from: 955, to: 955, country: "Малайзии" },
];

export type Gs1Info = {
  // Готовая фраза-подсказка для промпта, либо null если ничего не известно.
  hint: string | null;
  // Внутренний код магазина (префикс 2) — искать в интернете бессмысленно.
  internal: boolean;
  // Книга/периодика (ISBN/ISSN) — принципиально другой источник поиска.
  publication: boolean;
};

export function describeGs1(barcode: string): Gs1Info {
  const code = barcode.trim();
  if (!/^\d{8}$|^\d{13}$/.test(code)) return { hint: null, internal: false, publication: false };

  // EAN-8 не несёт страновой информации в том же виде — только короткий префикс.
  if (code.length === 8) return { hint: "Это короткий код EAN-8 (мелкая упаковка).", internal: false, publication: false };

  const p3 = Number(code.slice(0, 3));

  if (p3 >= 200 && p3 <= 299) {
    return { hint: null, internal: true, publication: false };
  }
  if (p3 === 977) {
    return { hint: "Это код периодического издания (ISSN) — журнал или газета.", internal: false, publication: true };
  }
  if (p3 === 978 || p3 === 979) {
    return { hint: "Это код книги (ISBN) — ищи издание по ISBN.", internal: false, publication: true };
  }

  const match = RANGES.find((r) => p3 >= r.from && p3 <= r.to);
  if (!match) return { hint: null, internal: false, publication: false };
  return { hint: `Префикс ${code.slice(0, 3)} — код зарегистрирован в ${match.country}.`, internal: false, publication: false };
}
