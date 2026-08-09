// Единственный способ завести супер-админа — через /register такую учётку
// создать нельзя (в коде для этого просто нет пути).
//
// Запуск:  SUPERADMIN_EMAIL=you@example.com SUPERADMIN_PASSWORD=... SUPERADMIN_NAME="Имя" npx tsx prisma/create-superadmin.ts
import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SUPERADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD || "";
  const name = process.env.SUPERADMIN_NAME || "Основатель";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("Укажите SUPERADMIN_EMAIL — настоящий email.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Укажите SUPERADMIN_PASSWORD — минимум 8 символов.");
    process.exit(1);
  }

  const exists = await prisma.superAdmin.findUnique({ where: { email } });
  if (exists) {
    console.error(`Супер-админ с email ${email} уже существует (id ${exists.id}).`);
    process.exit(1);
  }

  const sa = await prisma.superAdmin.create({
    data: { email, name, passwordHash: hashSync(password, 10) },
  });
  console.log(`✓ Супер-админ создан: ${sa.email} (${sa.name}), id ${sa.id}`);
  console.log("Вход: /root/login");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
