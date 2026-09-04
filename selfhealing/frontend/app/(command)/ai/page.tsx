import type { Metadata } from 'next'
import { OverviewClient } from '@/components/command/overview-client'

export const metadata: Metadata = {
  title: 'Command Center — Overview',
  description: 'BuildHub observability overview: risk, health, security posture.',
}

export default function AiOverviewPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <OverviewClient />
    </div>
  )
}