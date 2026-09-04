import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bh-bg px-6 text-center">
      <div className="flex items-center gap-2 text-bh-faint">
        <Icon name="code" size={28} className="text-bh-accent" />
      </div>
      <p className="mt-6 font-mono text-5xl font-semibold text-bh-ink">404</p>
      <h1 className="mt-3 text-xl font-semibold text-bh-ink">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-bh-muted">
        The page you’re looking for doesn’t exist or has been moved.
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/">
          <Button>Back to homepage</Button>
        </Link>
        <Link href="/projects">
          <Button variant="outline">Browse projects</Button>
        </Link>
      </div>
    </div>
  )
}
