import type { SVGProps } from 'react'

export type IconName =
  | 'home'
  | 'folder'
  | 'compass'
  | 'bell'
  | 'user'
  | 'settings'
  | 'search'
  | 'plus'
  | 'heart'
  | 'heartFilled'
  | 'comment'
  | 'share'
  | 'eye'
  | 'eyeOff'
  | 'x'
  | 'check'
  | 'menu'
  | 'arrowRight'
  | 'arrowLeft'
  | 'code'
  | 'users'
  | 'task'
  | 'update'
  | 'discussion'
  | 'activity'
  | 'launch'
  | 'document'
  | 'mention'
  | 'mail'
  | 'lock'
  | 'sparkles'
  | 'chevronDown'
  | 'more'
  | 'image'
  | 'link'
  | 'logout'
  | 'warning'
  | 'info'
  | 'asterisk'
  | 'edit'
  | 'trash'
  | 'grid'
  | 'shield'
  | 'radar'
  | 'terminal'
  | 'gitBranch'
  | 'history'
  | 'file'
  | 'download'
  | 'refresh'
  | 'bug'

const paths: Record<IconName, React.ReactNode> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </>
  ),
  folder: (
    <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" />
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </>
  ),
  bell: (
    <>
      <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9Z" />
      <path d="M10 18h4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h0a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h0a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v0a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  heart: (
    <path d="M12 20.5C7 16.5 3 13 3 8.8 3 6.2 5 4 7.5 4c1.6 0 3 .8 4.5 2.2C13.5 4.8 14.9 4 16.5 4 19 4 21 6.2 21 8.8c0 4.2-4 7.7-9 11.7Z" />
  ),
  heartFilled: (
    <path d="M12 20.5C7 16.5 3 13 3 8.8 3 6.2 5 4 7.5 4c1.6 0 3 .8 4.5 2.2C13.5 4.8 14.9 4 16.5 4 19 4 21 6.2 21 8.8c0 4.2-4 7.7-9 11.7Z" />
  ),
  comment: (
    <path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z" />
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M10.6 5.1A9 9 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.4 3.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a8.7 8.7 0 0 0 4.4-1.1" />
      <path d="m3 3 18 18" />
    </>
  ),
  x: <path d="M18 6 6 18M6 6l12 12" />,
  check: <path d="m4 12.5 5 5L20 6.5" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  arrowRight: <path d="M5 12h14M14 6l6 6-6 6" />,
  arrowLeft: <path d="M19 12H5m5-6-6 6 6 6" />,
  code: <path d="m8 7-5 5 5 5M16 7l5 5-5 5M13 4l-2 16" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 19c0-3.5 2.9-5.5 6.5-5.5S15.5 15.5 15.5 19" />
      <path d="M16 5.5a3.5 3.5 0 0 1 0 6M18.5 13.6c2.1.8 3 2.6 3 4.4" />
    </>
  ),
  task: (
    <>
      <path d="M4 6h16M4 12h10M4 18h7" />
      <path d="m17 14 2.5 2.5 3.5-4" transform="translate(0,-0)" />
    </>
  ),
  update: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </>
  ),
  discussion: (
    <>
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-3-.4-4.2-1.1L3 20l1.2-5A8.5 8.5 0 1 1 21 11.5Z" />
    </>
  ),
  activity: (
    <>
      <path d="M3 12h4l2.5-7 4 14L16 12h5" />
    </>
  ),
  launch: (
    <>
      <path d="M14 3h7v7" />
      <path d="M21 3 10 14" />
      <path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h5" />
    </>
  ),
  document: (
    <>
      <path d="M6 2h9l4 4v16H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
      <path d="M14 2v5h5M9 12h6M9 16h4M9 8h2" />
    </>
  ),
  mention: (
    <>
      <path d="M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0Z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M17 12v1a1.5 1.5 0 0 0 3 0" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3l1.8 4.6L18 9.5l-4.2 1.9L12 16l-1.8-4.6L6 9.5l4.2-1.9L12 3Z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m21 15-5-4-8 7" />
    </>
  ),
  link: (
    <>
      <path d="M9 15 15 9" />
      <path d="M10 4 8 6a4 4 0 0 0 0 6l1 1a4 4 0 0 0 1 .6" />
      <path d="m14 20 2-2a4 4 0 0 0 0-6l-1-1a4 4 0 0 0-1-.6" />
    </>
  ),
  logout: (
    <>
      <path d="M15 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10" />
      <path d="M10 12h11m-4-4 4 4-4 4" />
    </>
  ),
  warning: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  asterisk: <path d="M12 3v18M5 7l14 10M19 7 5 17" />,
  edit: (
    <>
      <path d="M4 20h4L20 8l-4-4L4 16v4Z" />
      <path d="m13 7 4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 6h16M9 6V4h6v2M6 6l1 14h10l1-14" />
      <path d="M10 10v6M14 10v6" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-3Z" />
      <path d="m9 12 2 2 4-4.5" />
    </>
  ),
  radar: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <path d="M12 12 19 8" />
      <circle cx="12" cy="12" r="0.5" fill="currentColor" />
    </>
  ),
  terminal: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m7 9 3 3-3 3M13 15h4" />
    </>
  ),
  gitBranch: (
    <>
      <circle cx="6" cy="5" r="2.5" />
      <circle cx="6" cy="19" r="2.5" />
      <circle cx="18" cy="7" r="2.5" />
      <path d="M6 7.5v9M18 9.5v1c0 2.5-2 4-5 4" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.4-6" />
      <path d="M3 4.5V9h4.5" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  file: (
    <>
      <path d="M6 2h9l4 4v16H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
      <path d="M14 2v5h5" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11M7 10l5 5 5-5" />
      <path d="M5 20h14" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.5-5.8" />
      <path d="M20 3v5h-5" />
    </>
  ),
  bug: (
    <>
      <rect x="8" y="9" width="8" height="11" rx="4" />
      <path d="M12 9V5M6 6l2 3M18 6l-2 3M5 11h3.5M15.5 11H19M5 17h3.5M15.5 17H19" />
    </>
  ),
}

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 20, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {name === 'heartFilled' ? (
        <path fill="currentColor" stroke="none" d="M12 20.5C7 16.5 3 13 3 8.8 3 6.2 5 4 7.5 4c1.6 0 3 .8 4.5 2.2C13.5 4.8 14.9 4 16.5 4 19 4 21 6.2 21 8.8c0 4.2-4 7.7-9 11.7Z" />
      ) : (
        paths[name]
      )}
    </svg>
  )
}
