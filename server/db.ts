import { PrismaClient } from "@prisma/client";

// Единственный экземпляр Prisma на процесс (в dev переживает HMR).
// Прямой доступ к prisma допустим только в auth/регистрации и системных задачах;
// весь доступ к данным организаций — через server/tenant.ts.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
