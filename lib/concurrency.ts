// Ограничение параллельности для пачек асинхронных вызовов (напр. ИИ-проверка
// импорта — не больше 3 запросов к RouterAI одновременно). Готового решения
// в проекте не было (ни p-limit, ни своего семафора) — минимальная дженерик-
// реализация без очереди промисов на N элементов сразу.
export async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function runOne() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, runOne);
  await Promise.all(workers);
  return results;
}
