# ТоргОС — production-образ. Multi-stage: собираем в builder, в финальный слой
# кладём только прод-зависимости + собранное приложение + Prisma-клиент.

# ---------- база ----------
FROM node:22-bookworm-slim AS base
# OpenSSL нужен движку Prisma
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
# Устойчивость npm к нестабильной сети
RUN npm config set fetch-retries 6 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm config set fetch-retry-mintimeout 15000 \
    && npm config set fetch-timeout 600000

# ---------- зависимости (полные, для сборки) ----------
FROM base AS deps
COPY package.json package-lock.json ./
# npm install, а не ci: у npm известный баг с кросс-платформенными optional-
# зависимостями (@emnapi/* у Tailwind oxide) — на Linux ci падает на lockfile,
# сгенерированном на macOS. install разрешает их корректно.
RUN for i in 1 2 3 4 5; do npm install --no-audit --no-fund && break || { echo "retry $i"; sleep 10; }; done

# ---------- сборка ----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate \
    && npm run build

# ---------- прод-зависимости (без dev) ----------
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN for i in 1 2 3 4 5; do npm install --omit=dev --no-audit --no-fund && break || { echo "retry $i"; sleep 10; }; done \
    && npm cache clean --force

# ---------- финальный образ ----------
FROM base AS runner
ENV PORT=3000
# Непривилегированный пользователь
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs torgos

COPY --from=prod-deps /app/node_modules ./node_modules
# Сгенерированный Prisma-клиент (движок под текущую платформу) — из builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY server.mjs ./server.mjs
COPY docker/entrypoint.sh ./docker/entrypoint.sh
RUN chmod +x ./docker/entrypoint.sh && chown -R torgos:nodejs /app

USER torgos
EXPOSE 3000

# Проверка живости приложения+БД
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker/entrypoint.sh"]
