-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'SUSPENDED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "nextPaymentAt" TIMESTAMP(3),
ADD COLUMN     "pastDueSince" TIMESTAMP(3),
ADD COLUMN     "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
ADD COLUMN     "trialEndsAt" TIMESTAMP(3),
ADD COLUMN     "trialReminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "impersonatedBySuperAdminId" TEXT;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "city" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "email" TEXT,
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "emailVerifyCode" TEXT,
ADD COLUMN     "emailVerifyCodeExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "InventorySession" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "startedById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "InventorySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLine" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "expectedQty" DECIMAL(10,3) NOT NULL,
    "countedQty" DECIMAL(10,3) NOT NULL,
    "countedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuperAdmin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "SuperAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuperAdminSession" (
    "id" TEXT NOT NULL,
    "superAdminId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuperAdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuperAdminAuditLog" (
    "id" TEXT NOT NULL,
    "superAdminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuperAdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventorySession_storeId_startedAt_idx" ON "InventorySession"("storeId", "startedAt");

-- CreateIndex
CREATE INDEX "InventoryLine_sessionId_idx" ON "InventoryLine"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLine_sessionId_productId_key" ON "InventoryLine"("sessionId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "SuperAdmin_email_key" ON "SuperAdmin"("email");

-- CreateIndex
CREATE INDEX "SuperAdminAuditLog_superAdminId_createdAt_idx" ON "SuperAdminAuditLog"("superAdminId", "createdAt");

-- CreateIndex
CREATE INDEX "SuperAdminAuditLog_targetType_targetId_idx" ON "SuperAdminAuditLog"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "InventorySession" ADD CONSTRAINT "InventorySession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySession" ADD CONSTRAINT "InventorySession_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLine" ADD CONSTRAINT "InventoryLine_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InventorySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLine" ADD CONSTRAINT "InventoryLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuperAdminSession" ADD CONSTRAINT "SuperAdminSession_superAdminId_fkey" FOREIGN KEY ("superAdminId") REFERENCES "SuperAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuperAdminAuditLog" ADD CONSTRAINT "SuperAdminAuditLog_superAdminId_fkey" FOREIGN KEY ("superAdminId") REFERENCES "SuperAdmin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

