-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "showInPos" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "debtPaidAt" TIMESTAMP(3),
ADD COLUMN     "debtorContact" TEXT,
ADD COLUMN     "debtorName" TEXT,
ADD COLUMN     "isDebt" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Sale_storeId_isDebt_debtPaidAt_idx" ON "Sale"("storeId", "isDebt", "debtPaidAt");
