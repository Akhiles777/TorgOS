// Tenant-изоляция в одном месте.
//
// tenantDb(orgId) возвращает Prisma-клиент, у которого КАЖДАЯ операция
// ограничена данными одной организации:
//  - чтения (findMany/findFirst/count/aggregate/groupBy) — где-фильтр добавляется автоматически;
//  - findUnique переписывается в findFirst с тем же фильтром;
//  - update/delete/upsert — сначала проверка, что запись принадлежит организации;
//  - create/createMany — все ссылки на store/product/sale/user в data
//    проверяются на принадлежность организации (рекурсивно, включая nested create).
//
// Сервисный код НЕ должен импортировать prisma из server/db напрямую.

import { Prisma } from "@prisma/client";
import { prisma } from "./db";

export class TenantError extends Error {
  constructor(message = "Доступ запрещён: данные другой организации") {
    super(message);
    this.name = "TenantError";
  }
}

type Where = Record<string, unknown>;

const TENANT_WHERE: Record<Prisma.ModelName, (orgId: string) => Where> = {
  Organization: (orgId) => ({ id: orgId }),
  Store: (orgId) => ({ organizationId: orgId }),
  User: (orgId) => ({ organizationId: orgId }),
  Session: (orgId) => ({ user: { organizationId: orgId } }),
  Product: (orgId) => ({ store: { organizationId: orgId } }),
  Supplier: (orgId) => ({ store: { organizationId: orgId } }),
  StockMovement: (orgId) => ({ product: { store: { organizationId: orgId } } }),
  Sale: (orgId) => ({ store: { organizationId: orgId } }),
  SaleItem: (orgId) => ({ sale: { store: { organizationId: orgId } } }),
};

// Скалярные внешние ключи, которые могут встретиться в data при create/update.
const FK_TARGETS: Record<string, "store" | "product" | "sale" | "user"> = {
  storeId: "store",
  productId: "product",
  saleId: "sale",
  userId: "user",
  cashierId: "user",
};

function collectFks(data: unknown, acc: Record<"store" | "product" | "sale" | "user", Set<string>>) {
  if (Array.isArray(data)) {
    for (const item of data) collectFks(item, acc);
    return;
  }
  if (data === null || typeof data !== "object") return;
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const target = FK_TARGETS[key];
    if (target && typeof value === "string") acc[target].add(value);
    else if (typeof value === "object") collectFks(value, acc);
  }
}

async function assertFksBelongToOrg(orgId: string, data: unknown, organizationIdInData?: unknown) {
  if (organizationIdInData !== undefined && organizationIdInData !== orgId) throw new TenantError();
  const acc = { store: new Set<string>(), product: new Set<string>(), sale: new Set<string>(), user: new Set<string>() };
  collectFks(data, acc);
  const checks: Promise<void>[] = [];
  const check = (count: Promise<number>, expected: number) =>
    checks.push(count.then((n) => { if (n !== expected) throw new TenantError(); }));
  if (acc.store.size) check(prisma.store.count({ where: { id: { in: [...acc.store] }, organizationId: orgId } }), acc.store.size);
  if (acc.product.size) check(prisma.product.count({ where: { id: { in: [...acc.product] }, store: { organizationId: orgId } } }), acc.product.size);
  if (acc.sale.size) check(prisma.sale.count({ where: { id: { in: [...acc.sale] }, store: { organizationId: orgId } } }), acc.sale.size);
  if (acc.user.size) check(prisma.user.count({ where: { id: { in: [...acc.user] }, organizationId: orgId } }), acc.user.size);
  await Promise.all(checks);
}

const lc = (s: string) => (s[0].toLowerCase() + s.slice(1)) as Uncapitalize<Prisma.ModelName>;

export function tenantDb(orgId: string) {
  if (!orgId) throw new TenantError("Не задана организация");
  return prisma.$extends({
    name: "tenant",
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async $allOperations({ model, operation, args, query }: any) {
          const guard = TENANT_WHERE[model as Prisma.ModelName](orgId);
          const delegate = (prisma as never as Record<string, any>)[lc(model)]; // eslint-disable-line @typescript-eslint/no-explicit-any
          const withGuard = (where: Where | undefined): Where => ({ AND: [guard, where ?? {}] });

          switch (operation) {
            case "findMany":
            case "findFirst":
            case "findFirstOrThrow":
            case "count":
            case "aggregate":
            case "groupBy":
            case "updateMany":
            case "deleteMany":
              return query({ ...args, where: withGuard(args?.where) });

            case "findUnique":
              return delegate.findFirst({ ...args, where: withGuard(args?.where) });
            case "findUniqueOrThrow":
              return delegate.findFirstOrThrow({ ...args, where: withGuard(args?.where) });

            case "update":
            case "delete": {
              const found = await delegate.findFirst({ where: withGuard(args?.where), select: { id: true } });
              if (!found) throw new TenantError("Запись не найдена в вашей организации");
              if (operation === "update") await assertFksBelongToOrg(orgId, args?.data, args?.data?.organizationId);
              return query(args);
            }

            case "upsert": {
              await assertFksBelongToOrg(orgId, [args?.create, args?.update], args?.create?.organizationId);
              const found = await delegate.findFirst({ where: withGuard(args?.where), select: { id: true } });
              if (!found) {
                // записи нет в нашей организации — но она может существовать в чужой
                const anywhere = await delegate.findFirst({ where: args?.where, select: { id: true } });
                if (anywhere) throw new TenantError();
              }
              return query(args);
            }

            case "create":
            case "createMany":
            case "createManyAndReturn": {
              const data = args?.data;
              await assertFksBelongToOrg(orgId, data, Array.isArray(data) ? undefined : data?.organizationId);
              return query(args);
            }

            default:
              // queryRaw и пр. через tenantDb недоступны
              throw new TenantError(`Операция ${operation} недоступна через tenantDb`);
          }
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;
