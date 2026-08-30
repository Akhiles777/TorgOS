import { describe, it, expect, vi, afterEach } from "vitest";
import { politeFetch, LookupUnavailableError } from "./services/politeFetch";

const origFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = origFetch; });

function mockFetch(sequence: (number | "throw")[]) {
  let i = 0;
  const calls = { count: 0 };
  globalThis.fetch = vi.fn(async () => {
    calls.count++;
    const step = sequence[Math.min(i++, sequence.length - 1)];
    if (step === "throw") throw new Error("сеть отвалилась");
    return new Response("ok", { status: step });
  }) as unknown as typeof fetch;
  return calls;
}

const OPTS = { minGapMs: 0, retries: 2, timeoutMs: 1000 };

describe("вежливые обращения к чужим справочникам", () => {
  it("повторяет запрос при 429 и возвращает удачный ответ", async () => {
    const calls = mockFetch([429, 200]);
    const res = await politeFetch("h1.example", "https://h1.example/x", {}, { ...OPTS, retries: 3 });
    expect(res.status).toBe(200);
    expect(calls.count).toBe(2);
  });

  it("после исчерпания повторов бросает ошибку, а не выдаёт «не найдено»", async () => {
    mockFetch([429]);
    await expect(politeFetch("h2.example", "https://h2.example/x", {}, { ...OPTS, retries: 1 }))
      .rejects.toBeInstanceOf(LookupUnavailableError);
  });

  it("404 отдаёт сразу — это честный ответ «такого товара нет», не сбой", async () => {
    const calls = mockFetch([404]);
    const res = await politeFetch("h3.example", "https://h3.example/x", {}, OPTS);
    expect(res.status).toBe(404);
    expect(calls.count).toBe(1); // без повторов
  });

  it("повторяет и при обрыве сети", async () => {
    const calls = mockFetch(["throw", 200]);
    const res = await politeFetch("h4.example", "https://h4.example/x", {}, { ...OPTS, retries: 2 });
    expect(res.status).toBe(200);
    expect(calls.count).toBe(2);
  });

  it("ошибка одного запроса не стопорит очередь к тому же хосту", async () => {
    mockFetch(["throw"]);
    await politeFetch("h5.example", "https://h5.example/a", {}, { ...OPTS, retries: 0 }).catch(() => {});
    mockFetch([200]);
    const res = await politeFetch("h5.example", "https://h5.example/b", {}, { ...OPTS, retries: 0 });
    expect(res.status).toBe(200);
  });

  it("5xx считает временным сбоем и повторяет", async () => {
    const calls = mockFetch([503, 200]);
    const res = await politeFetch("h6.example", "https://h6.example/x", {}, { ...OPTS, retries: 2 });
    expect(res.status).toBe(200);
    expect(calls.count).toBe(2);
  });
});
