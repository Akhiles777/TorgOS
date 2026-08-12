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

// SuperAdmin-модели намеренно НЕ проходят через tenantDb — супер-админу по
// определению нужен доступ ко всем организациям (см. server/superAdminAuth.ts,
// работает с сырым prisma). Если что-то по ошибке вызовет их через tenantDb —
// падаем громко, а не молча утекаем поперёк арендаторов.
const superAdminOnly = (): Where => {
  throw new TenantError("SuperAdmin-модели не проходят через tenantDb — используйте prisma напрямую");
};

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
  AiBriefing: (orgId) => ({ organizationId: orgId }),
  Employee: (orgId) => ({ store: { organizationId: orgId } }),
  Shift: (orgId) => ({ store: { organizationId: orgId } }),
  InventorySession: (orgId) => ({ store: { organizationId: orgId } }),
  InventoryLine: (orgId) => ({ session: { store: { organizationId: orgId } } }),
  SuperAdmin: superAdminOnly,
  SuperAdminSession: superAdminOnly,
  SuperAdminAuditLog: superAdminOnly,
  // Анонимные посетители лендинга — тоже вне организаций, тот же принцип.
  SiteEvent: superAdminOnly,
  PlatformBriefing: superAdminOnly,
  ImportBatch: (orgId) => ({ store: { organizationId: orgId } }),
  StoreAgent: (orgId) => ({ store: { organizationId: orgId } }),
  CameraDevice: (orgId) => ({ store: { organizationId: orgId } }),
  Camera: (orgId) => ({ device: { store: { organizationId: orgId } } }),
  // ── Общепит (HORECA) ──
  MenuCategory: (orgId) => ({ store: { organizationId: orgId } }),
  MenuItem: (orgId) => ({ store: { organizationId: orgId } }),
  ModifierGroup: (orgId) => ({ store: { organizationId: orgId } }),
  MenuItemModifierGroup: (orgId) => ({ menuItem: { store: { organizationId: orgId } } }),
  Modifier: (orgId) => ({ group: { store: { organizationId: orgId } } }),
  // Владелец рецепта опционален с обеих сторон (menuItemId/ownerProductId),
  // а ингредиент обязателен — скоупим по нему: он всегда товар точки.
  RecipeLine: (orgId) => ({ product: { store: { organizationId: orgId } } }),
  Order: (orgId) => ({ store: { organizationId: orgId } }),
  OrderItem: (orgId) => ({ order: { store: { organizationId: orgId } } }),
  ProductionDoc: (orgId) => ({ store: { organizationId: orgId } }),
  ProductionLine: (orgId) => ({ doc: { store: { organizationId: orgId } } }),
};

// Скалярные внешние ключи, которые могут встретиться в data при create/update.
type FkTarget =
  | "store" | "product" | "sale" | "user" | "employee" | "inventorySession" | "importBatch"
  | "storeAgent" | "cameraDevice" | "menuItem" | "menuCategory" | "modifierGroup" | "order" | "productionDoc";
const FK_TARGETS: Record<string, FkTarget> = {
  storeId: "store",
  productId: "product",
  saleId: "sale",
  userId: "user",
  cashierId: "user",
  employeeId: "employee",
  sessionId: "inventorySession",
  importBatchId: "importBatch",
  agentId: "storeAgent",
  deviceId: "cameraDevice",
  // ── Общепит (HORECA) ── addProductId/replacesProductId живут и в снимке
  // OrderItem.modifiers (Json) — collectFks рекурсивно обходит объекты,
  // поэтому эти ключи проверяются и там. Не переименовывать без синхронной
  // правки здесь.
  menuItemId: "menuItem",
  categoryId: "menuCategory",
  groupId: "modifierGroup",
  ownerProductId: "product",
  addProductId: "product",
  replacesProductId: "product",
  orderId: "order",
  productionDocId: "productionDoc",
};

function collectFks(data: unknown, acc: Record<FkTarget, Set<string>>) {
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
  const acc = {
    store: new Set<string>(), product: new Set<string>(), sale: new Set<string>(),
    user: new Set<string>(), employee: new Set<string>(), inventorySession: new Set<string>(),
    importBatch: new Set<string>(), storeAgent: new Set<string>(), cameraDevice: new Set<string>(),
    menuItem: new Set<string>(), menuCategory: new Set<string>(), modifierGroup: new Set<string>(),
    order: new Set<string>(), productionDoc: new Set<string>(),
  };
  collectFks(data, acc);
  const checks: Promise<void>[] = [];
  const check = (count: Promise<number>, expected: number) =>
    checks.push(count.then((n) => { if (n !== expected) throw new TenantError(); }));
  if (acc.store.size) check(prisma.store.count({ where: { id: { in: [...acc.store] }, organizationId: orgId } }), acc.store.size);
  if (acc.product.size) check(prisma.product.count({ where: { id: { in: [...acc.product] }, store: { organizationId: orgId } } }), acc.product.size);
  if (acc.sale.size) check(prisma.sale.count({ where: { id: { in: [...acc.sale] }, store: { organizationId: orgId } } }), acc.sale.size);
  if (acc.user.size) check(prisma.user.count({ where: { id: { in: [...acc.user] }, organizationId: orgId } }), acc.user.size);
  if (acc.employee.size) check(prisma.employee.count({ where: { id: { in: [...acc.employee] }, store: { organizationId: orgId } } }), acc.employee.size);
  if (acc.inventorySession.size) check(prisma.inventorySession.count({ where: { id: { in: [...acc.inventorySession] }, store: { organizationId: orgId } } }), acc.inventorySession.size);
  if (acc.importBatch.size) check(prisma.importBatch.count({ where: { id: { in: [...acc.importBatch] }, store: { organizationId: orgId } } }), acc.importBatch.size);
  if (acc.storeAgent.size) check(prisma.storeAgent.count({ where: { id: { in: [...acc.storeAgent] }, store: { organizationId: orgId } } }), acc.storeAgent.size);
  if (acc.cameraDevice.size) check(prisma.cameraDevice.count({ where: { id: { in: [...acc.cameraDevice] }, store: { organizationId: orgId } } }), acc.cameraDevice.size);
  if (acc.menuItem.size) check(prisma.menuItem.count({ where: { id: { in: [...acc.menuItem] }, store: { organizationId: orgId } } }), acc.menuItem.size);
  if (acc.menuCategory.size) check(prisma.menuCategory.count({ where: { id: { in: [...acc.menuCategory] }, store: { organizationId: orgId } } }), acc.menuCategory.size);
  if (acc.modifierGroup.size) check(prisma.modifierGroup.count({ where: { id: { in: [...acc.modifierGroup] }, store: { organizationId: orgId } } }), acc.modifierGroup.size);
  if (acc.order.size) check(prisma.order.count({ where: { id: { in: [...acc.order] }, store: { organizationId: orgId } } }), acc.order.size);
  if (acc.productionDoc.size) check(prisma.productionDoc.count({ where: { id: { in: [...acc.productionDoc] }, store: { organizationId: orgId } } }), acc.productionDoc.size);
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

            // findUnique/findUniqueOrThrow принимают where в формате «уникальный
            // идентификатор» — для составных ключей (RecipeLine, MenuItemModifierGroup,
            // Camera и т.п., @@unique([a,b])) это объект вида {a_b: {a,b}}, который
            // НЕЛЬЗЯ передать в findFirst (он ждёт обычный WhereInput-фильтр, не
            // WhereUniqueInput) — Prisma бросит PrismaClientValidationError. Поэтому
            // сначала достаём id через нативный delegate.findUnique (единственный метод,
            // который умеет составные ключи), потом отдельно проверяем организацию по id.
            case "findUnique":
            case "findUniqueOrThrow": {
              const exists = await delegate.findUnique({ where: args?.where, select: { id: true } });
              const inOrg = exists ? await delegate.findFirst({ where: withGuard({ id: exists.id }), select: { id: true } }) : null;
              if (!inOrg) {
                if (operation === "findUniqueOrThrow") throw new TenantError("Запись не найдена в вашей организации");
                return null;
              }
              return query(args);
            }

            case "update":
            case "delete": {
              const found = await delegate.findFirst({ where: withGuard(args?.where), select: { id: true } });
              if (!found) throw new TenantError("Запись не найдена в вашей организации");
              if (operation === "update") await assertFksBelongToOrg(orgId, args?.data, args?.data?.organizationId);
              return query(args);
            }

            case "upsert": {
              await assertFksBelongToOrg(orgId, [args?.create, args?.update], args?.create?.organizationId);
              // См. комментарий у findUnique выше — то же ограничение на составные ключи.
              const exists = await delegate.findUnique({ where: args?.where, select: { id: true } });
              if (exists) {
                const inOrg = await delegate.findFirst({ where: withGuard({ id: exists.id }), select: { id: true } });
                if (!inOrg) throw new TenantError();
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
