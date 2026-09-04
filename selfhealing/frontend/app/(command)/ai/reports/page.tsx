import type { Metadata } from 'next'
import { ReportsClient } from '@/components/command/reports-client'

export const metadata: Metadata = {
  title: 'Command Center — Reports',
  description: 'BuildHub incident PDF reports.',
}

export default function AiReportsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <ReportsClient />
    </div>
  )
}