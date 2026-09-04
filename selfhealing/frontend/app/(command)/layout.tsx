import { redirect } from 'next/navigation'

import { getSessionUser } from '@/lib/server/auth'
import { CommandShell } from '@/components/command/command-shell'

export default async function CommandLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getSessionUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <CommandShell
      user={{
        name: user.name,
        username: user.username,
      }}
    >
      {children}
    </CommandShell>
  )
}