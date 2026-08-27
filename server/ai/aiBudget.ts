// Предохранитель от «сгоревшего» баланса ИИ. Каждый поиск товара по штрихкоду
// стоит реальных денег владельца, а запускают его сотрудники (в том числе
// кассиры). Один залипший палец на кнопке или скрипт-переборщик не должен
// стоить дневной выручки — поэтому на точку действует потолок запросов в час.
//
// Счётчик в памяти процесса: приложение живёт одним процессом под pm2
// (см. деплой-скрипт `pm2 restart torgos`), отдельного хранилища ради лимита
// заводить не нужно. Перезапуск сбрасывает счётчик — это осознанный компромисс:
// задача защитить от аварийного перерасхода, а не считать биллинг.

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 300;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export class AiBudgetError extends Error {}

// Резервирует n запросов для точки. Бросает AiBudgetError, если лимит исчерпан.
export function reserveAiLookups(storeId: string, n: number): void {
  const now = Date.now();

  // Подчищаем истёкшие окна, чтобы Map не рос вечно: точек в системе много,
  // а активных в каждый час — единицы.
  if (buckets.size > 64) {
    for (const [key, b] of buckets) if (now >= b.resetAt) buckets.delete(key);
  }

  const bucket = buckets.get(storeId);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(storeId, { count: n, resetAt: now + WINDOW_MS });
    return;
  }
  if (bucket.count + n > MAX_PER_WINDOW) {
    const mins = Math.max(1, Math.ceil((bucket.resetAt - now) / 60_000));
    throw new AiBudgetError(
      `Слишком много запросов к ИИ за час (лимит ${MAX_PER_WINDOW}). Попробуйте через ${mins} мин. или заполните названия вручную.`,
    );
  }
  bucket.count += n;
}

// Только для тестов: сбросить состояние между кейсами.
export function __resetAiBudget(): void {
  buckets.clear();
}
