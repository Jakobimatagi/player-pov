import { BRAND } from '@/lib/brand'
import { cn } from '@/lib/utils'

/**
 * The mark: a player (the O) running an S-shaped route to the arrow, in the primary colour.
 * Same drawing as public/favicon.svg (GLYPH in scripts/brand-assets/render.mjs). Decorative:
 * wherever it is used, the surrounding link or text carries the name.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-8 shrink-0', className)}>
      <rect width="32" height="32" rx="7" className="fill-primary" />
      <g
        fill="none"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(-0.5 -1)"
        className="stroke-primary-foreground"
      >
        <circle cx="9" cy="23" r="3.6" />
        <path d="M9 19.4C9 16.5 10.5 16 13 16H19C21.5 16 23 15.5 23 12.5V7.5" />
        <path d="M18.5 12L23 7.5 27.5 12" />
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
