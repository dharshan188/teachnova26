'use client'

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/cn'
import type { IconName } from './icon'
import { Icon } from './icon'

interface MenuItem {
  id: string
  label?: string
  icon?: IconName
  danger?: boolean
  divider?: boolean
}

interface DropdownProps {
  trigger: ReactNode
  items: MenuItem[]
  onSelect: (id: string) => void
  align?: 'left' | 'right'
  menuLabel?: string
  className?: string
}

export function Dropdown({
  trigger,
  items,
  onSelect,
  align = 'right',
  menuLabel,
  className,
}: DropdownProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, items.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        const item = items[activeIndex]
        if (item && !item.divider) {
          onSelect(item.id)
          setOpen(false)
        }
      }
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, items, onSelect, activeIndex])

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={menuLabel}
          className={cn(
            'absolute z-30 mt-2 min-w-[200px] overflow-hidden rounded-lg border border-bh-line bg-bh-surface py-1 shadow-lg',
            'sm:animate-[fadeIn_.12s_ease-out]',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, i) =>
            item.divider ? (
              <div key={item.id} className="my-1 border-t border-bh-line" />
            ) : (
              <button
                key={item.id}
                role="menuitem"
                data-active={i === activeIndex || undefined}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => {
                  onSelect(item.id)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors',
                  item.danger
                    ? 'text-bh-danger hover:bg-bh-danger/5'
                    : 'text-bh-ink hover:bg-bh-surface-2',
                  i === activeIndex && 'bg-bh-surface-2',
                )}
              >
                {item.icon && (
                  <Icon name={item.icon} size={16} className="text-bh-muted" />
                )}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
