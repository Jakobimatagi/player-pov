import { TOKEN_COLORS, TOKEN_DARK_INK, TOKEN_LIGHT_INK } from '../theme/playerColors'
import type { TokenColor } from './types'

/** The seven token colours. Defined with the other player colours in `theme/playerColors`. */
export const COLOR_HEX: Record<TokenColor, string> = TOKEN_COLORS

/**
 * Line colour: the player's colour. White and black players would vanish on the field, so
 * the scene passes colours that read on its own background (`over`).
 */
export function lineHex(color: TokenColor, over?: { white: string; black: string }): string {
  if (color === 'white') return over?.white ?? TOKEN_DARK_INK
  if (color === 'black') return over?.black ?? COLOR_HEX.black
  return COLOR_HEX[color]
}

/** Label colour that reads on a token of this colour. */
export function onHex(color: TokenColor): string {
  return color === 'white' ? TOKEN_DARK_INK : TOKEN_LIGHT_INK
}
