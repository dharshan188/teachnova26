'use client'

import { ErrorState } from '@/components/feedback/error-state'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <ErrorState
        title="Something went wrong"
        description={error.message || 'An unexpected error occurred while loading this page.'}
        onRetry={reset}
      />
    </div>
  )
}
