import { AppShell } from '@/components/layout/app-shell'

// Public, read-only browse area shared by projects, project details, post
// details and public profiles. Unlike `(app)`, it does not require a session:
// guests can browse, and authentication is handled at the action level
// (like / comment / compose prompt a login).
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AppShell>{children}</AppShell>
}