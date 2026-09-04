-- Phase 9: Approval system with unique IDs, expiration, and state machine
-- + Telegram notification deduplication with lastSentAt

-- Update Approval table
ALTER TABLE "approvals" ADD COLUMN "approvalId" TEXT;
ALTER TABLE "approvals" ADD COLUMN "patchId" TEXT;
ALTER TABLE "approvals" ADD COLUMN "status" TEXT DEFAULT 'PENDING';
ALTER TABLE "approvals" ADD COLUMN "operator" TEXT;
ALTER TABLE "approvals" ADD COLUMN "expiresAt" TIMESTAMPTZ;
ALTER TABLE "approvals" ADD COLUMN "statusUpdatedAt" TIMESTAMPTZ;

-- Update existing rows with default values
UPDATE "approvals" SET "approvalId" = 'APR-' || LPAD(FLOOR(RANDOM() * 900000 + 100000)::TEXT, 6, '0') WHERE "approvalId" IS NULL;
UPDATE "approvals" SET "patchId" = 'PATCH-' || SUBSTRING("id" FROM 1 FOR 8) WHERE "patchId" IS NULL;
UPDATE "approvals" SET "operator" = 'legacy' WHERE "operator" IS NULL;
UPDATE "approvals" SET "expiresAt" = "createdAt" + INTERVAL '5 minutes' WHERE "expiresAt" IS NULL;
UPDATE "approvals" SET "statusUpdatedAt" = "createdAt" WHERE "statusUpdatedAt" IS NULL;

-- Make columns NOT NULL
ALTER TABLE "approvals" ALTER COLUMN "approvalId" SET NOT NULL;
ALTER TABLE "approvals" ALTER COLUMN "patchId" SET NOT NULL;
ALTER TABLE "approvals" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "approvals" ALTER COLUMN "operator" SET NOT NULL;
ALTER TABLE "approvals" ALTER COLUMN "expiresAt" SET NOT NULL;
ALTER TABLE "approvals" ALTER COLUMN "statusUpdatedAt" SET NOT NULL;

-- Add unique constraint on approvalId
CREATE UNIQUE INDEX "approvals_approvalId_key" ON "approvals"("approvalId");

-- Add index on status (incidentId index already exists)
CREATE INDEX "approvals_status_idx" ON "approvals"("status");

-- Drop old columns
ALTER TABLE "approvals" DROP COLUMN "decision";
ALTER TABLE "approvals" DROP COLUMN "reviewer";
ALTER TABLE "approvals" DROP COLUMN "reason";
ALTER TABLE "approvals" DROP COLUMN "outcome";

-- Update TelegramNotification table
ALTER TABLE "telegram_notifications" ADD COLUMN "lastSentAt" TIMESTAMPTZ;

-- Add unique constraint on (incidentId, type)
CREATE UNIQUE INDEX "telegram_notifications_incidentId_type_key" ON "telegram_notifications"("incidentId", "type");