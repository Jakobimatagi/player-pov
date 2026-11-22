import type { TokenColor } from './types'

export const COLOR_HEX: Record<TokenColor, string> = {
  white: '#f4f1ea',
  black: '#161616',
  red: '#e5534b',
  blue: '#3b82f6',
  green: '#22c55e',
  orange: '#f97316',
  purple: '#a855f7',
}

/** Line colour on grass: the player's colour, but black and white stay visible. */
export function lineHex(color: TokenColor): string {
  return COLOR_HEX[color]
}

/** Label colour that reads on a token of this colour. */
export function onHex(color: TokenColor): string {
  return color === 'white' || color === 'orange' || color === 'green' ? '#141414' : '#ffffff'
}
