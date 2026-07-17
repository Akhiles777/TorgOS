# ТоргОС

Мульти-тенантная CRM/POS-платформа для малой розницы и общепита. Касса, учёт
товара, кабинет владельца с аналитикой из реальных чеков. Первый клиент —
семейный гастроном в Махачкале; архитектура с первого дня рассчитана на SaaS.

## Стек

- Next.js 16 (App Router) + TypeScript strict
- PostgreSQL + Prisma
- Tailwind CSS v4 (свои компоненты, без UI-китов)
- WebSocket (синхронизация остатков между кассами) — кастомный сервер `server.mjs`
- Auth — самописные сессии по паттерну Lucia (httpOnly-cookie, в БД только sha256 токена)

## Запуск

```bash
# 1. Postgres должен быть поднят; создать БД:
createdb redstore                      # или psql -c 'CREATE DATABASE redstore;'

# 2. .env: DATABASE_URL="postgresql://<user>@localhost:5432/redstore"

npm install
npx prisma migrate dev                 # схема + миграции
npm run db:seed                        # организация «Гастроном», 42 товара, 14 дней продаж

npm run dev                            # http://localhost:3000  (Next + WebSocket)
```

## Демо-доступы

| Роль    | Логин   | Пароль    | Экран    |
|---------|---------|-----------|----------|
| Владелец| magomed | owner123  | `/owner` |
| Админ   | patimat | admin123  | `/admin` |
| Кассир  | amina   | kassa123  | `/pos`   |

## Проверка

```bash
npm test          # тест tenant-изоляции (организация A не видит данные B)
npm run build     # production-сборка + проверка типов
```

## Архитектура (ключевое)

- **Tenant-изоляция в одном месте** — `server/tenant.ts`. `tenantDb(orgId)` —
  Prisma-расширение, автоматически фильтрующее каждый запрос по организации и
  проверяющее принадлежность на записи/создании. Сервисы не трогают `prisma`
  напрямую.
- **Продажа атомарна** — `server/services/pos.ts::commitSale`: Sale + SaleItem[]
  + списание остатка + StockMovement[] в одной транзакции. Деньги считаются на
  сервере (`Prisma.Decimal`), `priceAtSale` фиксируется на момент чека.
- **Рекомендации ИИ** — `server/insights/`: контракт `generateInsights(input) →
  Insight[]`. Сейчас правила на чистой статистике (нет продаж N дней, низкая
  маржа, кончится через X дней, истекает срок). Позже сюда подключается LLM без
  смены контракта. Никаких выдуманных советов в UI.
- **Realtime** — `server.mjs` держит Next и WS в одном процессе; WS-соединение
  авторизуется cookie-сессией (storeId из БД, не от клиента), клиенты сгруппированы
  по точке. Мост к API-роутам — `server/realtime.ts` через общий `globalThis`.
# TorgOS
