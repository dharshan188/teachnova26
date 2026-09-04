import 'dotenv/config'
const { PrismaClient } = await import('@prisma/client')
const { PrismaPg } = await import('@prisma/adapter-pg')
const a = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: a })
const incs = await db.incident.findMany({ where:{ severity:'HIGH' }, orderBy:{ createdAt:'desc' }, take:3 })
for (const inc of incs) {
  console.log(`\n== ${inc.ref} status=${inc.status} created=${inc.createdAt.toISOString().slice(0,19)}`)
  const runs = await db.agentRun.findMany({ where:{ incidentId:inc.id }, orderBy:{ round:'asc' }, select:{ round:true, kind:true, status:true, confidence:true, error:true, inputSummary:true, outputSummary:true } })
  for (const r of runs) console.log(`  r${r.round} ${r.kind} status=${r.status} conf=${r.confidence} err=${(r.error??'').slice(0,160)} | in=${(r.inputSummary??'').slice(0,90)} | out=${(r.outputSummary??'').slice(0,120)}`)
  const evs = await db.incidentEvent.findMany({ where:{ incidentId:inc.id }, orderBy:{ at:'asc' } })
  for (const e of evs) console.log(`   EV ${e.stage} ${e.label} ${e.detail??''}`.slice(0,170))
  const logs = await db.logEvent.findMany({ where:{ incidentId:inc.id, level:'ERROR' }, orderBy:{ createdAt:'desc' }, take:3, select:{ errorCode:true, message:true } })
  for (const l of logs) console.log(`   LOG ${l.errorCode} ${l.message}`.slice(0,200))
}
await db.$disconnect()
