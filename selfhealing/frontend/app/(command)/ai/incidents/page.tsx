import type { Metadata } from 'next'
import { IncidentsClient } from '@/components/command/incidents-client'

export const metadata: Metadata = {
  title: 'Command Center — Incidents',
  description: 'BuildHub incidents and investigations.',
}

export default function AiIncidentsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <IncidentsClient />
    </div>
  )
}