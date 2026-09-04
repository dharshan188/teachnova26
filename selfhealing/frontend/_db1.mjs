import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })
const rows = await prisma.incident.groupBy({ by:['status','severity'], _count:{_all:true}, orderBy:[{status:'asc'},{severity:'asc'}] })
console.log('INCIDENTS by status+severity:')
for (const r of rows) console.log(`  ${r.status} ${r.severity}: ${r._count._all}`)
const active = await prisma.incident.findMany({ where:{ status:{in:['DETECTED','INVESTIGATING','AWAITING_REVIEW','WAITING_APPROVAL']} }, select:{ref:true,status:true,severity:true,createdAt:true,updatedAt:true}, orderBy:{createdAt:'desc'}, take:12 })
console.log('\nSAMPLE ACTIVE:')
for (const a of active) console.log(`  ${a.ref} ${a.status} ${a.severity} created=${a.createdAt.toISOString().slice(0,19)} upd=${a.updatedAt.toISOString().slice(0,19)}`)
await prisma.$disconnect()
