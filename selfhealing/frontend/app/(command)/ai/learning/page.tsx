import type { Metadata } from 'next'
import { LearningClient } from '@/components/command/learning-client'

export const metadata: Metadata = {
  title: 'Command Center — Learning',
  description: 'BuildHub repair memory, RL dataset and evaluation harness.',
}

export default function AiLearningPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <LearningClient />
    </div>
  )
}