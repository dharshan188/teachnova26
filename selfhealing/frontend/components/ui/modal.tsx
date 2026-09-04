'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'
import { Icon } from './icon'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    previousFocus.current = document.activeElement as HTMLElement
    const timer = setTimeout(() => panelRef.current?.focus(), 20)

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
      clearTimeout(timer)
      previousFocus.current?.focus?.()
    }
  }, [open, onClose])

  if (typeof document === 'undefined') return null
  if (!open) return null

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-bh-ink/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        aria-describedby={description ? 'modal-desc' : undefined}
        tabIndex={-1}
        className={cn(
          'relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-bh-surface p-5 shadow-2xl outline-none sm:rounded-xl',
          'sm:animate-[modalIn_.2s_ease-out]',
          sizes[size],
        )}
      >
        <div className="flex items-start justify-between gap-4">
          {title && (
            <div>
              <h2 id="modal-title" className="text-lg font-semibold text-bh-ink">
                {title}
              </h2>
              {description && (
                <p id="modal-desc" className="mt-1 text-sm text-bh-muted">
                  {description}
                </p>
              )}
            </div>
          )}
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-bh-faint hover:bg-bh-surface-2 hover:text-bh-ink"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="mt-4">{children}</div>
        {footer && (
          <div className="mt-6 flex flex-col-reverse gap-2 border-t border-bh-line pt-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
