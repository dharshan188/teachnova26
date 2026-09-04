import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })
const ACTIVE = ['DETECTED','INVESTIGATING','AWAITING_REVIEW','WAITING_APPROVAL']
const stale = await prisma.incident.findMany({ where:{ status:{in:ACTIVE} }, select:{id:true,ref:true,status:true} })
console.log('Stale active incidents to clear:', stale.length)
for (const s of stale) console.log('  ', s.ref, s.status)
const upd = await prisma.incident.updateMany({
  where:{ status:{in:ACTIVE} },
  data:{ status:'AI_REPAIR_FAILED', summary:'Cleared stale self-healing test artifact (dashboard reset to NORMAL).' },
})
console.log('updated incidents:', upd.count)
// Complete any dangling repairAttempts still in active-ish states
const att = await prisma.repairAttempt.updateMany({
  where:{ status:{in:['WAITING_APPROVAL','APPLYING','EVIDENCE_READY','RISK_CLASSIFIED','IN_PROGRESS']} },
  data:{ status:'FAILED', completedAt:new Date(), summary:'Cleared stale test attempt (dashboard reset).' },
})
console.log('updated attempts:', att.count)
/* verify */
const remaining = await prisma.incident.count({ where:{ status:{in:ACTIVE} } })
console.log('remaining active incidents:', remaining)
await prisma.$disconnect()
