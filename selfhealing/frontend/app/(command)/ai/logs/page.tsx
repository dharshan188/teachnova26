import type { Metadata } from 'next'
import { LogsClient } from '@/components/command/logs-client'

export const metadata: Metadata = {
  title: 'Command Center — Live Logs',
  description: 'BuildHub structured observability stream.',
}

export default function AiLogsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <LogsClient />
    </div>
  )
}