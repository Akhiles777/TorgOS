#!/bin/sh
# Точка входа контейнера приложения.
# ВАЖНО: применяем ТОЛЬКО migrate deploy — накатывает готовые миграции без
# пересоздания БД. Никакого reset/seed в проде: данные клиента неприкосновенны.
set -e

echo "ТоргОС: применяю миграции (migrate deploy)…"
npx prisma migrate deploy

echo "ТоргОС: запускаю сервер…"
exec node server.mjs
