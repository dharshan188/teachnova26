#!/usr/bin/env node
/**
 * Wipe BuildHub observability rows (Incident, IncidentEvent, AgentRun,
 * Approval, LogEvent, TelegramNotification) back to the pristine, clean Phase 8
 * baseline.
 *
 * Phase 7 used to re-seed hardcoded demo incidents here so the command center
 * resumed at a fixed demo baseline (risk 72 / cyber 94 / health 98 / active 2).
 * Phase 8 removed that behaviour — incidents, log events and security findings
 * must be real. This script now deletes the Phase 7/8 runtime rows only and
 * leaves the seed (demo users/posts/projects) untouched:
 *
 *   riskScore 0 | cyberSafetyScore 100 | systemHealth 100 | activeIncidents 0
 *
 * Usage: node scripts/reset-observability.mjs
 * Requires: a reachable database (same .env as the app).
 */

import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Run from the frontend directory so dotenv loads .env.')
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Wiping observability rows…')

  // FK-safe deletion order: children before parents (sequential, not parallel).
  const approvals = await prisma.approval.deleteMany()
  const telegram = await prisma.telegramNotification.deleteMany()
  const events = await prisma.incidentEvent.deleteMany()
  const logs = await prisma.logEvent.deleteMany()
  const runs = await prisma.agentRun.deleteMany()
  const findings = await prisma.securityFinding.deleteMany()
  const incidents = await prisma.incident.deleteMany()
  console.log(
    `Deleted ${incidents.count} incidents, ${events.count} events, ${runs.count} agent runs, ` +
      `${approvals.count} approvals, ${logs.count} log events, ${findings.count} security findings, ` +
      `${telegram.count} telegram notifications.`,
  )
}

main()
  .then(() => {
    console.log('Wipe complete — run scripts/verify-observability.mjs to confirm the clean baseline (risk 0 | cyber 100 | health 100 | active 0).')
  })
  .catch((err) => {
    console.error('Wipe failed:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())