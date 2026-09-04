-- Phase 9 upgrade: iterative Coder/Critic/Judge conversation + Phase 10
-- learning foundation (repair memory, experience records, patch audit trail).

-- ---------------------------------------------------------------------------
-- 1. Enum additions (values added but not used inside this transaction)
-- ---------------------------------------------------------------------------
ALTER TYPE "AgentName" ADD VALUE IF NOT EXISTS 'CODER';
ALTER TYPE "IncidentStatus" ADD VALUE IF NOT EXISTS 'WAITING_APPROVAL';
ALTER TYPE "IncidentStatus" ADD VALUE IF NOT EXISTS 'AI_REPAIR_FAILED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'HIGH_RISK_APPROVAL_REQUIRED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REPAIR_APPLIED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REPAIR_FAILED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ROLLBACK_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RECOVERY';

-- ---------------------------------------------------------------------------
-- 2. AgentRun conversation metadata
-- ---------------------------------------------------------------------------
ALTER TABLE "agent_runs" ADD COLUMN "round" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "agent_runs" ADD COLUMN "kind" TEXT;
ALTER TABLE "agent_runs" ADD COLUMN "durationMs" INTEGER;
ALTER TABLE "agent_runs" ADD COLUMN "promptTokens" INTEGER;
ALTER TABLE "agent_runs" ADD COLUMN "completionTokens" INTEGER;
ALTER TABLE "agent_runs" ADD COLUMN "context" JSONB;
CREATE INDEX "agent_runs_round_idx" ON "agent_runs"("round");

-- ---------------------------------------------------------------------------
-- 3. Approval -> RepairAttempt linkage (FK added after repair_attempts exists)
-- ---------------------------------------------------------------------------
ALTER TABLE "approvals" ADD COLUMN "repairAttemptId" TEXT;
CREATE INDEX "approvals_repairAttemptId_idx" ON "approvals"("repairAttemptId");

-- ---------------------------------------------------------------------------
-- 4. New tables
-- ---------------------------------------------------------------------------
CREATE TABLE "repair_attempts" (
  "id" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "risk" TEXT,
  "riskReason" TEXT,
  "model" TEXT,
  "summary" TEXT,
  "error" TEXT,
  "patchState" JSONB,
  "startedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ,
  CONSTRAINT "repair_attempts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "repair_attempts_attemptId_key" ON "repair_attempts"("attemptId");
CREATE INDEX "repair_attempts_incidentId_idx" ON "repair_attempts"("incidentId");
CREATE INDEX "repair_attempts_status_idx" ON "repair_attempts"("status");
ALTER TABLE "repair_attempts"
  ADD CONSTRAINT "repair_attempts_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approvals"
  ADD CONSTRAINT "approvals_repairAttemptId_fkey"
  FOREIGN KEY ("repairAttemptId") REFERENCES "repair_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "patch_records" (
  "id" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "repairAttemptId" TEXT,
  "patchId" TEXT NOT NULL,
  "file" TEXT NOT NULL,
  "line" INTEGER,
  "function" TEXT,
  "status" TEXT NOT NULL DEFAULT 'CHECKPOINTED',
  "originalContent" TEXT,
  "appliedContent" TEXT,
  "risk" TEXT,
  "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
  "approvalId" TEXT,
  "validationResult" TEXT,
  "appliedAt" TIMESTAMPTZ,
  "rolledBackAt" TIMESTAMPTZ,
  "validatedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "patch_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "patch_records_incidentId_idx" ON "patch_records"("incidentId");
CREATE INDEX "patch_records_repairAttemptId_idx" ON "patch_records"("repairAttemptId");
CREATE INDEX "patch_records_patchId_idx" ON "patch_records"("patchId");
ALTER TABLE "patch_records"
  ADD CONSTRAINT "patch_records_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "patch_records"
  ADD CONSTRAINT "patch_records_repairAttemptId_fkey"
  FOREIGN KEY ("repairAttemptId") REFERENCES "repair_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "repair_memories" (
  "id" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "errorSignature" TEXT NOT NULL,
  "stackTrace" TEXT,
  "file" TEXT,
  "feature" TEXT,
  "endpoint" TEXT,
  "rootCause" TEXT,
  "patchSummary" TEXT,
  "risk" TEXT,
  "outcome" TEXT NOT NULL,
  "humanDecision" TEXT,
  "humanReason" TEXT,
  "reward" INTEGER NOT NULL DEFAULT 0,
  "recurrenceCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "repair_memories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "repair_memories_incidentId_key" ON "repair_memories"("incidentId");
CREATE INDEX "repair_memories_errorSignature_idx" ON "repair_memories"("errorSignature");
CREATE INDEX "repair_memories_file_idx" ON "repair_memories"("file");
CREATE INDEX "repair_memories_endpoint_idx" ON "repair_memories"("endpoint");
CREATE INDEX "repair_memories_outcome_idx" ON "repair_memories"("outcome");
ALTER TABLE "repair_memories"
  ADD CONSTRAINT "repair_memories_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "repair_experiences" (
  "id" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "memoryId" TEXT,
  "attemptId" TEXT,
  "state" JSONB NOT NULL,
  "action" JSONB NOT NULL,
  "reward" INTEGER NOT NULL DEFAULT 0,
  "nextState" JSONB,
  "terminal" BOOLEAN NOT NULL DEFAULT false,
  "outcome" TEXT,
  "humanDecision" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "repair_experiences_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "repair_experiences_incidentId_idx" ON "repair_experiences"("incidentId");
CREATE INDEX "repair_experiences_terminal_idx" ON "repair_experiences"("terminal");
ALTER TABLE "repair_experiences"
  ADD CONSTRAINT "repair_experiences_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "repair_experiences"
  ADD CONSTRAINT "repair_experiences_memoryId_fkey"
  FOREIGN KEY ("memoryId") REFERENCES "repair_memories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "repair_experiences"
  ADD CONSTRAINT "repair_experiences_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "repair_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;