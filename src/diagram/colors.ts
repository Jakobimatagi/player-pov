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

/**
 * Line colour: the player's colour. White and black players would vanish on the field, so
 * the scene passes colours that read on its own background (`over`).
 */
export function lineHex(color: TokenColor, over?: { white: string; black: string }): string {
  if (color === 'white') return over?.white ?? '#1f2328'
  if (color === 'black') return over?.black ?? COLOR_HEX.black
  return COLOR_HEX[color]
}

/** Label colour that reads on a token of this colour. */
export function onHex(color: TokenColor): string {
  return color === 'white' ? '#1f2328' : '#ffffff'
}
