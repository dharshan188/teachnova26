#!/usr/bin/env node
/**
 * Dump real BuildHub LogEvent rows to a JSON file for the (pure, stdlib-only)
 * Python security log analyzer.
 *
 * Reads the same .env as the app, so run from the frontend directory:
 *
 *   node scripts/dump-log-events.mjs [--limit 2000] [-o out.json]
 *
 * The payload is only ever written to stdout when no -o file is given; it
 * contains no secrets (log rows carry no tokens/keys).
 */

import 'dotenv/config'

import { writeFileSync } from 'node:fs'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Run from the frontend directory so dotenv loads .env.')
}

const args = process.argv.slice(2)
const limitArg = args.find((a) => a.startsWith('--limit'))
const limit = limitArg ? Number.parseInt(limitArg.split('=')[1] ?? '2000', 10) : 2000
const outIndex = args.indexOf('-o')
const outFile = outIndex !== -1 ? args[outIndex + 1] : null

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  const rows = await prisma.logEvent.findMany({
    orderBy: { createdAt: 'asc' },
    take: Number.isFinite(limit) ? limit : 2000,
    select: {
      id: true,
      level: true,
      service: true,
      message: true,
      route: true,
      method: true,
      status: true,
      requestId: true,
      errorCode: true,
      incidentId: true,
      createdAt: true,
    },
  })

  const payload = {
    exportedAt: new Date().toISOString(),
    count: rows.length,
    rows: rows.map((row) => ({
      id: row.id,
      level: row.level,
      service: row.service,
      message: row.message,
      route: row.route ?? null,
      method: row.method ?? null,
      status: row.status ?? null,
      requestId: row.requestId ?? null,
      errorCode: row.errorCode ?? null,
      incidentId: row.incidentId ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
  }

  const json = JSON.stringify(payload, null, 2)
  if (outFile) {
    writeFileSync(outFile, json + '\n')
    console.log(`Wrote ${rows.length} rows to ${outFile}`)
  } else {
    process.stdout.write(json + '\n')
  }
}

main()
  .catch((err) => {
    console.error('dump-log-events failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())