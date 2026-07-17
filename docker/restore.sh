#!/bin/sh
# Восстановление БД из бэкапа. Запускать на сервере рядом с docker-compose.yml.
#
#   sh docker/restore.sh                      # список доступных бэкапов
#   sh docker/restore.sh redstore-20260717-030000.dump
#
# Восстановление ПЕРЕЗАПИШЕТ текущую базу: останавливает приложение, накатывает
# дамп разовым контейнером (у него есть том с бэкапами и доступ к БД), поднимает
# приложение обратно.
set -e

DUMP="$1"

if [ -z "$DUMP" ]; then
  echo "Доступные бэкапы:"
  docker compose run --rm --no-deps --entrypoint sh backup -c "ls -1t /backups/redstore-*.dump 2>/dev/null || echo '  (пусто)'"
  echo ""
  echo "Использование: sh docker/restore.sh <имя-файла.dump>"
  exit 0
fi

echo "!!! Текущая база будет ПЕРЕЗАПИСАНА данными из $DUMP"
printf "Продолжить? [введите YES]: "
read -r ANSWER
[ "$ANSWER" = "YES" ] || { echo "Отменено."; exit 1; }

echo "1/3 Останавливаю приложение и бэкапы…"
docker compose stop app backup

echo "2/3 Восстанавливаю из $DUMP…"
# --clean --if-exists: удаляет существующие объекты перед восстановлением
docker compose run --rm --entrypoint sh backup -c \
  "PGPASSWORD=\$POSTGRES_PASSWORD pg_restore --clean --if-exists --no-owner -h db -U \$POSTGRES_USER -d \$POSTGRES_DB /backups/$DUMP"

echo "3/3 Поднимаю приложение и бэкапы…"
docker compose up -d app backup
echo "Готово. Проверьте: curl http://localhost:\${APP_PORT:-3000}/api/health"
