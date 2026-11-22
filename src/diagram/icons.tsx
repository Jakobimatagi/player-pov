import type { ReactNode } from 'react'
import type { LineType } from './types'

function Svg({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      className="dge-icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** One icon per line ending, drawn pointing up like the reference toolbar. */
export function LineIcon({ type }: { type: LineType }) {
  switch (type) {
    case 'route':
      return (
        <Svg size={16}>
          <line x1="12" y1="20" x2="12" y2="5" />
          <polyline points="7,10 12,4 17,10" />
        </Svg>
      )
    case 'block':
      return (
        <Svg size={16}>
          <line x1="12" y1="20" x2="12" y2="6" />
          <line x1="7" y1="6" x2="17" y2="6" />
        </Svg>
      )
    case 'path':
      return (
        <Svg size={16}>
          <line x1="12" y1="20" x2="12" y2="4" />
        </Svg>
      )
    case 'motion':
      return (
        <Svg size={16}>
          <path d="M5 19 Q8 15 5 11 T5 4" />
        </Svg>
      )
    case 'dashedRoute':
      return (
        <Svg size={16}>
          <line x1="12" y1="20" x2="12" y2="5" strokeDasharray="3,3" />
          <polyline points="7,10 12,4 17,10" />
        </Svg>
      )
    case 'segmentedBlock':
      return (
        <Svg size={16}>
          <line x1="12" y1="20" x2="12" y2="6" strokeDasharray="3,3" />
          <line x1="7" y1="6" x2="17" y2="6" />
          <line x1="8" y1="13" x2="16" y2="13" />
        </Svg>
      )
    case 'checkRelease':
      return (
        <Svg size={16}>
          <line x1="12" y1="20" x2="12" y2="8" strokeDasharray="3,3" />
          <circle cx="12" cy="5" r="2" fill="currentColor" />
        </Svg>
      )
  }
}

export const PointerIcon = () => (
  <Svg>
    <path d="M4 3l7 18 2-7 7-2z" />
  </Svg>
)
export const CircleIcon = () => (
  <Svg size={16}>
    <circle cx="12" cy="12" r="8" />
  </Svg>
)
export const TriangleIcon = () => (
  <Svg size={16}>
    <polygon points="12,5 20,19 4,19" />
  </Svg>
)
export const CommentIcon = () => (
  <Svg>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Svg>
)
export const BoxSelectIcon = () => (
  <Svg>
    <rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="4,3" />
  </Svg>
)
export const LassoIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="8" strokeDasharray="4,3" />
  </Svg>
)
export const TrashIcon = () => (
  <Svg size={14}>
    <polyline points="3,6 5,6 21,6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </Svg>
)
export const UndoIcon = () => (
  <Svg size={14}>
    <path d="M3 10a7 7 0 0 1 12-5l3 3" />
    <polyline points="18,2 18,8 12,8" />
  </Svg>
)
export const RedoIcon = () => (
  <Svg size={14}>
    <path d="M21 10a7 7 0 0 0-12-5L6 8" />
    <polyline points="6,2 6,8 12,8" />
  </Svg>
)
