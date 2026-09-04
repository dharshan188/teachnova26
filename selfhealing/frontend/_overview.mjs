import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })
const since = new Date(Date.now() - 24*60*60*1000)
const active = await prisma.incident.findMany({ where:{ status:{in:['DETECTED','INVESTIGATING','AWAITING_REVIEW','WAITING_APPROVAL']}, updatedAt:{gte:since} }, select:{severity:true} })
let max='NONE'; const rank={NONE:0,LOW:1,MEDIUM:2,HIGH:3,CRITICAL:4}
for(const i of active){ if(rank[i.severity]>rank[max]) max=i.severity }
console.log('ACTIVE count:', active.length, 'maxSeverity:', max)
console.log('policy => risk', {NONE:0,LOW:15,MEDIUM:30,HIGH:50,CRITICAL:60}[max], '| health', {NONE:100,LOW:85,MEDIUM:30,HIGH:55,CRITICAL:20}[max])
await prisma.$disconnect()
