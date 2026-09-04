'use client'

import { useState } from 'react'
import { AuthProvider } from '@/components/auth/auth-provider'
import { Sidebar } from '@/components/navigation/sidebar'
import { Header } from '@/components/navigation/header'
import { MobileNav } from '@/components/navigation/mobile-nav'

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <AuthProvider>
      <div className="flex min-h-screen bg-bh-bg">
        <Sidebar />
        <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header onMenuClick={() => setMobileNavOpen(true)} />
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
            {children}
          </main>
        </div>
      </div>
    </AuthProvider>
  )
}
