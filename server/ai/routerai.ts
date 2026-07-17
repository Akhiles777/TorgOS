// Тонкий клиент к RouterAI (routerai.ru) — OpenAI-совместимый роутер к LLM
// с оплатой из РФ. Используется ТОЛЬКО как необязательная надстройка над
// честными правилами в server/insights/ — при любой ошибке (нет ключа,
// таймаут, сеть, лимиты) бросает AiUnavailableError, и вызывающий код
// должен деградировать тихо (показать кеш/ничего), а не падать.

const ENDPOINT = "https://routerai.ru/api/v1/chat/completions";
// Живой замер: грaунded-промпт с полным дашбордом занимает ~11.5с у роутера.
// Секция стримится отдельным Suspense-блоком и не блокирует остальной
// дашборд, поэтому щедрый запас по времени безопаснее короткого таймаута.
const TIMEOUT_MS = 25_000;

export class AiUnavailableError extends Error {}

type ChatMessage = { role: "system" | "user"; content: string };

export async function chatComplete(messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.ROUTERAI_API_KEY;
  if (!apiKey) throw new AiUnavailableError("ROUTERAI_API_KEY не задан");
  const model = process.env.ROUTERAI_MODEL || "anthropic/claude-sonnet-5";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: 400 }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new AiUnavailableError(`RouterAI ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new AiUnavailableError("Пустой ответ модели");
    return content.trim();
  } catch (e) {
    if (e instanceof AiUnavailableError) throw e;
    if ((e as { name?: string })?.name === "AbortError") throw new AiUnavailableError("Таймаут RouterAI");
    throw new AiUnavailableError(`Сбой сети RouterAI: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}
