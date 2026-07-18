// Создаёт/обновляет логины БЕЗ стирания данных (в отличие от db seed).
// Нужен, когда на проде «не получается войти»: просто выставляет пароли
// и роли для gasan и admin, привязывая их к существующей точке.
//
// Запуск:  npx tsx prisma/ensure-logins.ts
// Пароли можно переопределить: GASAN_PASSWORD=... ADMIN_PASSWORD=... npx tsx prisma/ensure-logins.ts
import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";

const prisma = new PrismaClient();

const GASAN_PASSWORD = process.env.GASAN_PASSWORD || "gasan777";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

async function main() {
  // Берём первую (обычно единственную) точку. Логины привязываются к ней,
  // чтобы им были доступны админка и касса.
  const store = await prisma.store.findFirst({ select: { id: true, organizationId: true } });
  if (!store) {
    console.error("Нет ни одной точки. Сначала выполните `npx prisma db seed` (или SEED_EMPTY=1).");
    process.exit(1);
  }

  const accounts = [
    { login: "gasan", name: "Алункачев Гасан", role: "OWNER" as const, password: GASAN_PASSWORD },
    { login: "admin", name: "Администратор", role: "ADMIN" as const, password: ADMIN_PASSWORD },
  ];

  for (const a of accounts) {
    const passwordHash = hashSync(a.password, 10);
    await prisma.user.upsert({
      where: { login: a.login },
      update: { passwordHash, role: a.role, storeId: store.id, organizationId: store.organizationId, name: a.name },
      create: { login: a.login, passwordHash, role: a.role, storeId: store.id, organizationId: store.organizationId, name: a.name },
    });
    console.log(`✓ ${a.login} — пароль обновлён, роль ${a.role}`);
  }

  console.log("Готово. Данные (товары, чеки) не тронуты.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
