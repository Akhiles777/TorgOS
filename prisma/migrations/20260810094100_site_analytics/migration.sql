-- CreateEnum
CREATE TYPE "SiteEventType" AS ENUM ('PAGEVIEW', 'SCROLL_25', 'SCROLL_50', 'SCROLL_75', 'SCROLL_100', 'CTA_CLICK');

-- CreateTable
CREATE TABLE "SiteEvent" (
    "id" TEXT NOT NULL,
    "type" "SiteEventType" NOT NULL,
    "sessionId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "referrer" TEXT,
    "utmSource" TEXT,
    "device" TEXT,
    "cta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformBriefing" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "content" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformBriefing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteEvent_type_createdAt_idx" ON "SiteEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "SiteEvent_sessionId_idx" ON "SiteEvent"("sessionId");

-- CreateIndex
CREATE INDEX "SiteEvent_path_createdAt_idx" ON "SiteEvent"("path", "createdAt");

