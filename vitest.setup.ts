// До сих пор переменные окружения в тестах доходили только через Prisma
// (сама подгружает .env при инициализации клиента) — для тестов без БД
// (напр. server/cameraCrypto.test.ts) этого не происходит. Грузим .env сами,
// без новой зависимости (простой построчный парсер, .env в проекте — плоский
// KEY=value без интерполяции).
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(__dirname, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}
