'use client'

import { useState } from 'react'
import { avatarColor, initials } from '@/lib/avatar'
import { cn } from '@/lib/cn'

interface AvatarProps {
  name: string
  username?: string
  src?: string | null
  size?: number
  className?: string
  online?: boolean
}

export function Avatar({ name, size = 40, src, className, online }: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false)

  const showImage = Boolean(src) && !imgFailed
  const bg = avatarColor(name)

  return (
    <span
      className={cn('relative inline-flex shrink-0 overflow-hidden rounded-full', className)}
      style={{ width: size, height: size }}
    >
      <span
        className="flex h-full w-full items-center justify-center rounded-full text-white font-semibold select-none"
        style={{ background: showImage ? 'transparent' : bg, fontSize: size * 0.38 }}
      >
        {showImage && (
          // eslint-disable-next-line @next/next/no-img-element -- Avatars are arbitrary user-provided URLs; next/image can't optimize/allowlist unknown domains.
          <img
            src={src as string}
            alt={name}
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover"
          />
        )}
        {!showImage && initials(name)}
      </span>
      {online !== undefined && (
        <span
          className={cn(
            'absolute bottom-0 right-0 block rounded-full ring-2 ring-bh-surface',
            online ? 'bg-bh-success' : 'bg-bh-faint',
          )}
          style={{ width: size * 0.28, height: size * 0.28 }}
          aria-hidden="true"
        />
      )}
    </span>
  )
}
