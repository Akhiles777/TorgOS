// Аккуратные обращения к чужим бесплатным справочникам.
//
// Зачем это понадобилось. Пользователь заметил: добавляешь товары по одному —
// находятся, загоняешь пачку в 20-30 — половина «не найдена». Замер показал
// причину: Open Food Facts отвечает 429 «слишком много запросов», а код
// молча считал любой не-200 ответ словом «нет такого товара». То есть сбой
// связи выглядел в интерфейсе ровно как отсутствие товара, и чем больше
// пачка, тем чаще это случалось.
//
// Отсюда три правила ниже: не частить (минимальный промежуток между
// запросами к одному хосту), повторять при временных сбоях (429/5xx/таймаут)
// и honest-ошибка вместо тихого «не найдено», когда повторы не помогли.

type HostState = {
  // Очередь: обещание завершения предыдущего запроса к этому хосту.
  chain: Promise<unknown>;
  // До этого момента хост «на паузе» — он попросил не беспокоить (429).
  blockedUntil: number;
  // Сколько раз подряд хост отказал. Нужен предохранитель: Open Food Facts
  // при лимите отвечает 429 на КАЖДЫЙ запрос, и повторы с паузами растягивали
  // разбор пачки из 30 позиций с 8 секунд до минуты. Разумнее один раз
  // понять, что источник сейчас недоступен, и не ходить к нему совсем.
  failStreak: number;
  // До этого момента источник считается отключённым.
  circuitUntil: number;
};

const hosts = new Map<string, HostState>();

function stateFor(host: string): HostState {
  let s = hosts.get(host);
  if (!s) {
    s = { chain: Promise.resolve(), blockedUntil: 0, failStreak: 0, circuitUntil: 0 };
    hosts.set(host, s);
  }
  return s;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class LookupUnavailableError extends Error {}

export type PoliteOptions = {
  // Минимальный промежуток между запросами к этому хосту.
  minGapMs: number;
  // Сколько раз повторить при временной ошибке.
  retries: number;
  timeoutMs: number;
  // После стольких отказов подряд перестаём ходить к источнику…
  circuitAfter?: number;
  // …на столько миллисекунд. Настройки разные для разных источников:
  // Open Food Facts при лимите отказывает всем подряд, и его лучше отключать
  // быстро и надолго; российский справочник надёжен, и «наказывать» его на
  // пять минут из-за пары таймаутов — значит терять рабочий источник.
  circuitCooldownMs?: number;
};

async function attempt(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Временные сбои: их надо повторить, а не выдавать за «товар не найден».
// 404 сюда НЕ входит — это честный ответ «такого штрихкода у нас нет».
function isTransient(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

/**
 * Запрос к внешнему справочнику с очередью, паузами и повторами.
 * Возвращает Response (в том числе 404 — это валидный ответ «нет такого»)
 * либо бросает LookupUnavailableError, если справочник так и не ответил.
 */
export async function politeFetch(
  host: string,
  url: string,
  init: RequestInit,
  opts: PoliteOptions,
): Promise<Response> {
  const state = stateFor(host);

  // Запросы к одному хосту выстраиваем в очередь: параллельные волны по 5
  // штрихкодов превращались в 15 одновременных обращений и ловили 429.
  const run = state.chain.then(async () => {
    // Источник признан недоступным — отвечаем сразу, не тратя время пачки.
    if (Date.now() < state.circuitUntil) {
      throw new LookupUnavailableError(`${host} временно недоступен`);
    }
    const wait = state.blockedUntil - Date.now();
    if (wait > 0) await sleep(wait);

    let lastStatus = 0;
    for (let i = 0; i <= opts.retries; i++) {
      try {
        const res = await attempt(url, init, opts.timeoutMs);
        if (!isTransient(res.status)) {
          state.failStreak = 0;
          await sleep(opts.minGapMs);
          return res;
        }
        lastStatus = res.status;
        // Сервер может прямо сказать, сколько ждать.
        const retryAfter = Number(res.headers.get("retry-after"));
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 10_000)
          : Math.min(500 * 2 ** i, 8_000) + Math.floor(Math.random() * 250);
        // Пока ждём — не пускаем к этому хосту остальные запросы очереди.
        state.blockedUntil = Date.now() + backoff;
        await sleep(backoff);
      } catch {
        // Сеть или таймаут — тоже повод повторить, но не молчать в конце.
        lastStatus = 0;
        await sleep(Math.min(500 * 2 ** i, 8_000));
      }
    }
    state.failStreak++;
    if (state.failStreak >= (opts.circuitAfter ?? 3)) {
      state.circuitUntil = Date.now() + (opts.circuitCooldownMs ?? 5 * 60 * 1000);
      state.failStreak = 0;
      console.warn(`${host}: слишком много отказов, отключаем на ${Math.round((opts.circuitCooldownMs ?? 300000) / 1000)}с`);
    }
    throw new LookupUnavailableError(
      lastStatus ? `${host} отвечает ${lastStatus}` : `${host} не отвечает`,
    );
  });

  // Цепочку продолжаем в любом случае, иначе одна ошибка застопорит очередь.
  state.chain = run.catch(() => undefined);
  return run;
}
