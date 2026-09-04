import type { Metadata } from 'next'
import { PipelineClient } from '@/components/command/pipeline-client'

export const metadata: Metadata = {
  title: 'Command Center — AI Pipeline',
  description: 'BuildHub live Fixer → Critic → Judge analysis pipeline.',
}

export default function AiPipelinePage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PipelineClient />
    </div>
  )
}