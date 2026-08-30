-- Возвраты по чеку. Только добавление колонок с DEFAULT — существующие строки
-- не переписываются, старые чеки автоматически получают «возвратов не было».
-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "returnedAt" TIMESTAMP(3),
ADD COLUMN     "returnedTotal" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "returnedQty" DECIMAL(10,3) NOT NULL DEFAULT 0;
