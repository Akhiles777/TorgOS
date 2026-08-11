#!/usr/bin/env bash
set -euo pipefail

# Установка агента точки ТоргОС — запускать на мини-ПК/Raspberry Pi рядом
# с регистратором в магазине.
#
# Использование (токен и готовую команду смотрите в /admin/cameras/settings
# после нажатия «Добавить агента»):
#   curl -fsSL https://<ваш-домен>/agent-dist/install.sh | sudo bash -s -- <TOKEN> <SERVER_WSS_URL>

TOKEN="${1:?Использование: install.sh <TOKEN> <SERVER_WSS_URL>}"
SERVER_URL="${2:?Использование: install.sh <TOKEN> <SERVER_WSS_URL>}"
DIST_BASE="${TORGOS_DIST_BASE:-https://storeos.online/agent-dist}"
INSTALL_DIR=/opt/torgos-agent
GO2RTC_BIN="$INSTALL_DIR/go2rtc"
NODE_VERSION=22.11.0

echo "== ТоргОС: установка агента камер =="

if [ "$(id -u)" -ne 0 ]; then
  echo "Запустите с sudo: curl ... | sudo bash -s -- ..." >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"

# 1. Node.js — для самого агента (go2rtc — отдельный бинарник, Node не требует)
if ! command -v node >/dev/null 2>&1; then
  echo "-- Node.js не найден, ставлю…"
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64) NODE_ARCH=x64 ;;
    aarch64|arm64) NODE_ARCH=arm64 ;;
    armv7l) NODE_ARCH=armv7l ;;
    *) echo "Неизвестная архитектура: $ARCH" >&2; exit 1 ;;
  esac
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" -o /tmp/torgos-node.tar.xz
  tar -xJf /tmp/torgos-node.tar.xz -C /opt
  ln -sf "/opt/node-v${NODE_VERSION}-linux-${NODE_ARCH}/bin/node" /usr/local/bin/node
  ln -sf "/opt/node-v${NODE_VERSION}-linux-${NODE_ARCH}/bin/npm" /usr/local/bin/npm
  rm /tmp/torgos-node.tar.xz
else
  echo "-- Node.js уже установлен ($(node -v))"
fi

# 2. go2rtc — один бинарник
if [ ! -f "$GO2RTC_BIN" ]; then
  echo "-- Скачиваю go2rtc…"
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64) GO2RTC_ARCH=amd64 ;;
    aarch64|arm64) GO2RTC_ARCH=arm64 ;;
    armv7l) GO2RTC_ARCH=arm ;;
    *) echo "Неизвестная архитектура: $ARCH" >&2; exit 1 ;;
  esac
  curl -fsSL "https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_linux_${GO2RTC_ARCH}" -o "$GO2RTC_BIN"
  chmod +x "$GO2RTC_BIN"
else
  echo "-- go2rtc уже установлен"
fi

# 3. Файлы агента + go2rtc-клиент
echo "-- Загружаю агент…"
curl -fsSL "$DIST_BASE/agent.mjs" -o "$INSTALL_DIR/agent.mjs"
curl -fsSL "$DIST_BASE/go2rtcClient.mjs" -o "$INSTALL_DIR/go2rtcClient.mjs"

# .mjs у Node уже сам по себе означает ES-модуль, package.json здесь только
# ради npm install — agent.mjs использует пакет "ws" (WebSocket-клиент).
cat > "$INSTALL_DIR/package.json" <<'EOF'
{ "name": "torgos-agent", "dependencies": { "ws": "^8.18.0" } }
EOF

WS_URL="${SERVER_URL%/}/agent-tunnel"
cat > "$INSTALL_DIR/config.json" <<EOF
{ "token": "$TOKEN", "serverUrl": "$WS_URL" }
EOF
chmod 600 "$INSTALL_DIR/config.json"

# go2rtc — пустой стартовый конфиг, потоки синхронизирует сам агент через API
cat > "$INSTALL_DIR/go2rtc.yaml" <<'EOF'
api:
  listen: "127.0.0.1:1984"
EOF

echo "-- Ставлю зависимость ws (агент — WS-клиент)…"
(cd "$INSTALL_DIR" && /usr/local/bin/npm install --omit=dev --no-audit --no-fund >/dev/null)

# 4. systemd-юниты
echo "-- Настраиваю systemd…"
curl -fsSL "$DIST_BASE/go2rtc.service.template" | sed "s#{{INSTALL_DIR}}#$INSTALL_DIR#g" > /etc/systemd/system/torgos-go2rtc.service
curl -fsSL "$DIST_BASE/torgos-agent.service.template" | sed "s#{{INSTALL_DIR}}#$INSTALL_DIR#g" > /etc/systemd/system/torgos-agent.service

systemctl daemon-reload
systemctl enable --now torgos-go2rtc
systemctl enable --now torgos-agent

echo ""
echo "== Готово =="
echo "Проверить статус:  systemctl status torgos-agent torgos-go2rtc"
echo "Логи агента:        journalctl -u torgos-agent -f"
echo "Через несколько секунд агент появится «онлайн» в /admin/cameras/settings"
