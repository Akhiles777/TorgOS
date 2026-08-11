-- CreateEnum
CREATE TYPE "CameraVendor" AS ENUM ('DAHUA', 'HIKVISION', 'GENERIC');

-- CreateEnum
CREATE TYPE "CameraConnectionMode" AS ENUM ('AGENT', 'DIRECT');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('PENDING', 'ONLINE', 'OFFLINE');

-- CreateTable
CREATE TABLE "StoreAgent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'PENDING',
    "lastSeenAt" TIMESTAMP(3),
    "lastIp" TEXT,
    "agentVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CameraDevice" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" "CameraVendor" NOT NULL,
    "connection" "CameraConnectionMode" NOT NULL DEFAULT 'AGENT',
    "agentId" TEXT,
    "host" TEXT NOT NULL,
    "rtspPort" INTEGER NOT NULL DEFAULT 554,
    "httpPort" INTEGER NOT NULL DEFAULT 80,
    "username" TEXT NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "channelCount" INTEGER NOT NULL DEFAULT 1,
    "urlOverride" JSONB,
    "clockOffsetSec" INTEGER,
    "clockCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CameraDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Camera" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "channel" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Camera_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreAgent_tokenHash_key" ON "StoreAgent"("tokenHash");

-- CreateIndex
CREATE INDEX "StoreAgent_storeId_idx" ON "StoreAgent"("storeId");

-- CreateIndex
CREATE INDEX "CameraDevice_storeId_idx" ON "CameraDevice"("storeId");

-- CreateIndex
CREATE INDEX "CameraDevice_agentId_idx" ON "CameraDevice"("agentId");

-- CreateIndex
CREATE INDEX "Camera_deviceId_idx" ON "Camera"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Camera_deviceId_channel_key" ON "Camera"("deviceId", "channel");

-- AddForeignKey
ALTER TABLE "StoreAgent" ADD CONSTRAINT "StoreAgent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CameraDevice" ADD CONSTRAINT "CameraDevice_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CameraDevice" ADD CONSTRAINT "CameraDevice_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "StoreAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Camera" ADD CONSTRAINT "Camera_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "CameraDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

