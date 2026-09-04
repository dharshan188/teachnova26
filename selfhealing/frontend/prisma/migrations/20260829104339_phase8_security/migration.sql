-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('DETECTED', 'PROCESSED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INCIDENT', 'ESCALATION', 'TEST');

-- AlterTable
ALTER TABLE "agent_runs" ADD COLUMN     "error" TEXT,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "output" JSONB;

-- AlterTable
ALTER TABLE "incidents" ADD COLUMN     "detectedBy" TEXT;

-- CreateTable
CREATE TABLE "security_findings" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "endpoint" TEXT,
    "method" TEXT,
    "detail" TEXT,
    "signal" JSONB,
    "status" "FindingStatus" NOT NULL DEFAULT 'DETECTED',
    "hitCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_notifications" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT,
    "type" "NotificationType" NOT NULL DEFAULT 'INCIDENT',
    "severity" "IncidentSeverity",
    "chatId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'SENT',
    "telegramMessageId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "security_findings_fingerprint_key" ON "security_findings"("fingerprint");

-- CreateIndex
CREATE INDEX "security_findings_status_idx" ON "security_findings"("status");

-- CreateIndex
CREATE INDEX "security_findings_ruleId_idx" ON "security_findings"("ruleId");

-- CreateIndex
CREATE INDEX "security_findings_createdAt_idx" ON "security_findings"("createdAt");

-- CreateIndex
CREATE INDEX "telegram_notifications_incidentId_idx" ON "telegram_notifications"("incidentId");

-- CreateIndex
CREATE INDEX "telegram_notifications_deliveryStatus_idx" ON "telegram_notifications"("deliveryStatus");

-- AddForeignKey
ALTER TABLE "telegram_notifications" ADD CONSTRAINT "telegram_notifications_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
