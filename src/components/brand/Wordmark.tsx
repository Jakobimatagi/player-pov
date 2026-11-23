import { BRAND } from '@/lib/brand'
import { cn } from '@/lib/utils'

/**
 * The mark: a player (the O) running an S-shaped route to the arrow, in the primary colour.
 * Same drawing as public/favicon.svg.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-8 shrink-0', className)}>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <g
        fill="none"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary-foreground"
      >
        <circle cx="10" cy="23.5" r="3" />
        <path d="M10 20.5C10 14 22 18.5 22 11.5V8.5" />
        <path d="M18 12l4-4 4 4" />
      </g>
    </svg>
  )
}

/** "Scheme" plus "HQ" in the accent colour, set in the display face. */
export function Wordmark({ className, mark = true }: { className?: string; mark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      {mark ? <BrandMark /> : null}
      <span className="font-display text-[1.35em] leading-none font-extrabold tracking-wide uppercase">
        {BRAND.wordmark.lead} <span className="text-primary">{BRAND.wordmark.accent}</span>
      </span>
    </span>
  )
}
