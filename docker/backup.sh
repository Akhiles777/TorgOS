#!/bin/sh
# Автоматические бэкапы БД. Раз в INTERVAL секунд делает pg_dump в custom-формате
# (-Fc, пригоден для pg_restore), хранит последние KEEP штук, старые удаляет.
# Первый бэкап делается сразу при старте.
set -e

: "${BACKUP_INTERVAL:=86400}"   # раз в сутки
: "${BACKUP_KEEP:=14}"          # хранить 14 копий
: "${POSTGRES_HOST:=db}"
export PGPASSWORD="$POSTGRES_PASSWORD"

mkdir -p /backups

backup_once() {
  ts=$(date +%Y%m%d-%H%M%S)
  file="/backups/redstore-$ts.dump"
  echo "[backup] $ts — начинаю"
  if pg_dump -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$file"; then
    echo "[backup] готово: $file ($(du -h "$file" | cut -f1))"
  else
    echo "[backup] ОШИБКА pg_dump" >&2
    rm -f "$file"
    return 1
  fi
  # Ретеншн: оставляем последние BACKUP_KEEP
  count=$(ls -1t /backups/redstore-*.dump 2>/dev/null | wc -l)
  if [ "$count" -gt "$BACKUP_KEEP" ]; then
    ls -1t /backups/redstore-*.dump | tail -n +$((BACKUP_KEEP + 1)) | while read -r old; do
      echo "[backup] удаляю старую: $old"
      rm -f "$old"
    done
  fi
}

echo "[backup] сервис запущен: интервал ${BACKUP_INTERVAL}s, хранить ${BACKUP_KEEP}"
# Ждём готовности БД
until pg_isready -h "$POSTGRES_HOST" -U "$POSTGRES_USER" >/dev/null 2>&1; do
  echo "[backup] жду БД…"; sleep 3
done

while true; do
  backup_once || true
  sleep "$BACKUP_INTERVAL"
done
