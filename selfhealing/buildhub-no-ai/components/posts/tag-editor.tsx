'use client'

import { useState } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from '@/components/ui/icon'

const MAX_TAGS = 5
const TAG_PATTERN = /^[a-z0-9-]+$/

interface TagEditorProps {
  value: string[]
  onChange: (tags: string[]) => void
  onError?: (message: string | null) => void
  max?: number
  className?: string
}

/**
 * Compact tag input shared by the post composer, the post edit modal and the
 * project create/edit modals. Tags are validated client-side with the same
 * rules as the server schema.
 */
export function TagEditor({ value, onChange, onError, max = MAX_TAGS, className }: TagEditorProps) {
  const [input, setInput] = useState('')

  const addTag = () => {
    const raw = input.trim().replace(/^#/, '').toLowerCase()
    if (!raw) {
      setInput('')
      return
    }
    if (value.length >= max) {
      onError?.(`You can add up to ${max} tags.`)
      return
    }
    if (!TAG_PATTERN.test(raw)) {
      onError?.('Tags may only contain lowercase letters, numbers, and hyphens.')
      return
    }
    if (!value.includes(raw)) onChange([...value, raw])
    setInput('')
    onError?.(null)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag()
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-bh-faint">
          <Icon name="asterisk" size={14} />
        </span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={addTag}
          placeholder="Add a tag, press Enter"
          aria-label="Add a tag"
          className="h-8 w-full rounded-md border border-bh-line bg-bh-surface-2 pl-8 pr-3 text-xs text-bh-muted placeholder:text-bh-faint focus:border-bh-accent focus:outline-none"
        />
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onChange(value.filter((t) => t !== tag))}
              aria-label={`Remove tag ${tag}`}
              className="group inline-flex items-center gap-1 rounded-full bg-bh-accent-soft px-2.5 py-0.5 text-xs font-medium text-bh-accent-strong hover:bg-bh-accent hover:text-white"
            >
              #{tag}
              <Icon name="x" size={12} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}