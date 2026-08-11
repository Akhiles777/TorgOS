-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isSemiFinished" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RecipeLine" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT,
    "ownerProductId" TEXT,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecipeLine_productId_idx" ON "RecipeLine"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeLine_menuItemId_productId_key" ON "RecipeLine"("menuItemId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeLine_ownerProductId_productId_key" ON "RecipeLine"("ownerProductId", "productId");

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_ownerProductId_fkey" FOREIGN KEY ("ownerProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Владелец рецепта — ровно один из menuItemId / ownerProductId (рецепт блюда
-- либо рецепт полуфабриката, не оба и не ни одного сразу). Prisma не
-- моделирует CHECK-constraints, поэтому не тронет и не сдрейфует при
-- следующей `prisma migrate dev --create-only`. Сервисный слой проверяет
-- тот же инвариант — это подстраховка на случай прямых правок в БД.
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_owner_xor"
  CHECK (num_nonnulls("menuItemId", "ownerProductId") = 1);
