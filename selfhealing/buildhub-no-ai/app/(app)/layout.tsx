import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/server/auth'
import { AppShell } from '@/components/layout/app-shell'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getSessionUser()

  // Server-side protection for the authenticated application area. Redirects
  // unauthenticated visitors to the login page.
  if (!user) {
    redirect('/login')
  }

  return <AppShell>{children}</AppShell>
}
