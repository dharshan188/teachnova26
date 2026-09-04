'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/cn'
import { Icon, type IconName } from './icon'

type ToastTone = 'success' | 'error' | 'info'
interface Toast {
  id: number
  tone: ToastTone
  title: string
  description?: string
}

interface ToastContextValue {
  toast: (tone: ToastTone, title: string, description?: string) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

const toneConfig: Record<ToastTone, { icon: IconName; ring: string }> = {
  success: { icon: 'check', ring: 'text-bh-success' },
  error: { icon: 'warning', ring: 'text-bh-danger' },
  info: { icon: 'info', ring: 'text-bh-info' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((tone: ToastTone, title: string, description?: string) => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, tone, title, description }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto flex gap-3 rounded-lg border border-bh-line bg-bh-surface p-3.5 shadow-lg',
              'sm:animate-[slideInRight_.18s_ease-out]',
            )}
          >
            <span className={cn('mt-0.5', toneConfig[t.tone].ring)}>
              <Icon name={toneConfig[t.tone].icon} size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-bh-ink">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-xs text-bh-muted">{t.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
