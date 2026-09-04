import { Logo } from '@/components/layout/logo'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bh-bg">
      <header className="flex items-center justify-between px-6 py-5">
        <Logo href="/" />
        <span className="text-sm text-bh-muted">Developer collaboration platform</span>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="px-6 py-5 text-center text-xs text-bh-faint">
        © {new Date().getFullYear()} BuildHub
      </footer>
    </div>
  )
}
