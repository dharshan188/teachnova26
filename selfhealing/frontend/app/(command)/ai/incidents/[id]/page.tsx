import type { Metadata } from 'next'
import { IncidentDetailClient } from '@/components/command/incident-detail-client'

interface PageProps {
  params: Promise<{ id: string }>
}

export const metadata: Metadata = {
  title: 'Command Center — Incident',
  description: 'BuildHub incident investigation view.',
}

export default async function AiIncidentDetailPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-6xl">
      <IncidentDetailClient id={id} />
    </div>
  )
}