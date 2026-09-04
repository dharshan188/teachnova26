import 'dotenv/config'
const { PrismaClient } = await import('@prisma/client')
const { PrismaPg } = await import('@prisma/adapter-pg')
const a = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: a })
const ACTIVE = ['DETECTED','INVESTIGATING','AWAITING_REVIEW','WAITING_APPROVAL']
const upd = await db.incident.updateMany({ where:{ status:{in:ACTIVE} }, data:{ status:'AI_REPAIR_FAILED', summary:'Pre-demo reset.' } })
await db.repairAttempt.updateMany({ where:{ status:{in:['WAITING_APPROVAL','APPLYING','EVIDENCE_READY','RISK_CLASSIFIED','IN_PROGRESS']} }, data:{ status:'FAILED', completedAt:new Date() } })
console.log('reset incidents:', upd.count)
const left = await db.incident.count({ where:{ status:{in:ACTIVE} } })
console.log('remaining active:', left)
await db.$disconnect()
