import type { IconName } from '@/components/ui/icon'

export interface NavItem {
  href: string
  label: string
  icon: IconName
  requiresAuth?: boolean
}

export const mainNav: NavItem[] = [
  { href: '/feed', label: 'Home', icon: 'home', requiresAuth: true },
  { href: '/projects', label: 'Projects', icon: 'folder' },
]

export const footerNav: NavItem[] = [
  { href: '/ai', label: 'Command Center', icon: 'radar', requiresAuth: true },
  { href: '/settings', label: 'Settings', icon: 'settings' },
]

export function isActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}
