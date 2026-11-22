import type { TokenColor } from './types'

/** The seven token colours, as in the reference editor's swatches. */
export const COLOR_HEX: Record<TokenColor, string> = {
  white: '#ffffff',
  black: '#3a3a3a',
  red: '#e5473b',
  blue: '#2d6fe0',
  green: '#3fae52',
  orange: '#f0901f',
  purple: '#8c4fd1',
}

/** Line colour on the light field: the player's colour, but a white player draws dark. */
export function lineHex(color: TokenColor): string {
  return color === 'white' ? '#1f2328' : COLOR_HEX[color]
}

/** Label colour that reads on a token of this colour. */
export function onHex(color: TokenColor): string {
  return color === 'white' ? '#1f2328' : '#ffffff'
}
