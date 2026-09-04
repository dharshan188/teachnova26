'use client'

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type KeyboardEvent,
} from 'react'
import { cn } from '@/lib/cn'

interface TabsContextValue {
  active: string
  setActive: (id: string) => void
}

const TabsContext = createContext<TabsContextValue | undefined>(undefined)

function useTabs() {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('Tabs components must be used within <Tabs>')
  return ctx
}

interface TabsProps {
  defaultValue: string
  children: ReactNode
  onChange?: (id: string) => void
  className?: string
}

export function Tabs({ defaultValue, children, onChange, className }: TabsProps) {
  const [active, setActive] = useState(defaultValue)
  return (
    <TabsContext.Provider
      value={{
        active,
        setActive: (id) => {
          setActive(id)
          onChange?.(id)
        },
      }}
    >
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

interface TabListProps {
  children: ReactNode
  className?: string
  'aria-label'?: string
}

export function TabList({ children, className, 'aria-label': ariaLabel }: TabListProps) {
  const { active, setActive } = useTabs()

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(
      (e.currentTarget as HTMLDivElement).querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    )
    const idx = tabs.findIndex((t) => t.getAttribute('data-id') === active)
    let next = -1
    if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length
    if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length
    if (next >= 0) {
      e.preventDefault()
      const target = tabs[next]
      target.focus()
      setActive(target.getAttribute('data-id') || '')
    }
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn('flex gap-1 border-b border-bh-line', className)}
    >
      {children}
    </div>
  )
}

interface TabProps {
  id: string
  children: ReactNode
  icon?: ReactNode
  count?: number
}

export function Tab({ id, children, icon, count }: TabProps) {
  const { active, setActive } = useTabs()
  const isActive = active === id
  return (
    <button
      role="tab"
      data-id={id}
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      onClick={() => setActive(id)}
      className={cn(
        '-mb-px inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors',
        isActive
          ? 'border-bh-accent text-bh-ink'
          : 'border-transparent text-bh-muted hover:border-bh-line-strong hover:text-bh-ink',
      )}
    >
      {icon}
      {children}
      {count !== undefined && (
        <span className="ml-0.5 rounded-full bg-bh-surface-2 px-1.5 text-xs text-bh-muted">
          {count}
        </span>
      )}
    </button>
  )
}

interface TabPanelProps {
  id: string
  children: ReactNode
  className?: string
}

export function TabPanel({ id, children, className }: TabPanelProps) {
  const { active } = useTabs()
  if (active !== id) return null
  return (
    <div
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={id}
      className={cn('pt-5', className)}
    >
      {children}
    </div>
  )
}
