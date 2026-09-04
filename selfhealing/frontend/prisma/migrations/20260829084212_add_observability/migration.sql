-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('DETECTED', 'INVESTIGATING', 'AWAITING_REVIEW', 'RESOLVED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('INFO', 'WARN', 'ERROR', 'SECURITY');

-- CreateEnum
CREATE TYPE "AgentName" AS ENUM ('FIXER', 'CRITIC', 'JUDGE');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('QUEUED', 'ANALYZING', 'GENERATING', 'WAITING', 'REVIEWING', 'COMPLETE', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'DETECTED',
    "severity" "IncidentSeverity" NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "cyberSafetyImpact" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "summary" TEXT,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "requestId" TEXT,
    "errorCode" TEXT,
    "expectedRootCause" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_events" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "detail" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "agent" "AgentName" NOT NULL,
    "role" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "currentActivity" TEXT,
    "inputSummary" TEXT,
    "outputSummary" TEXT,
    "confidence" INTEGER,
    "mode" TEXT NOT NULL DEFAULT 'SIMULATION',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "reviewer" TEXT NOT NULL,
    "reason" TEXT,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_events" (
    "id" TEXT NOT NULL,
    "level" "LogLevel" NOT NULL,
    "service" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "route" TEXT,
    "method" TEXT,
    "status" INTEGER,
    "requestId" TEXT,
    "errorCode" TEXT,
    "incidentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "incidents_ref_key" ON "incidents"("ref");

-- CreateIndex
CREATE INDEX "incidents_status_idx" ON "incidents"("status");

-- CreateIndex
CREATE INDEX "incidents_severity_idx" ON "incidents"("severity");

-- CreateIndex
CREATE INDEX "incidents_createdAt_idx" ON "incidents"("createdAt");

-- CreateIndex
CREATE INDEX "incident_events_incidentId_idx" ON "incident_events"("incidentId");

-- CreateIndex
CREATE INDEX "agent_runs_incidentId_idx" ON "agent_runs"("incidentId");

-- CreateIndex
CREATE INDEX "approvals_incidentId_idx" ON "approvals"("incidentId");

-- CreateIndex
CREATE INDEX "log_events_level_idx" ON "log_events"("level");

-- CreateIndex
CREATE INDEX "log_events_service_idx" ON "log_events"("service");

-- CreateIndex
CREATE INDEX "log_events_route_idx" ON "log_events"("route");

-- CreateIndex
CREATE INDEX "log_events_createdAt_idx" ON "log_events"("createdAt");

-- CreateIndex
CREATE INDEX "log_events_requestId_idx" ON "log_events"("requestId");

-- AddForeignKey
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_events" ADD CONSTRAINT "log_events_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
