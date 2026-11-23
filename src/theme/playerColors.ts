import type { TokenColor } from '../diagram/types'
import type { Team } from '../play/types'

/**
 * Every colour that belongs to a player rather than to the theme. They are fixed on purpose:
 * saved plays name the token colours (`TokenColor`), so only the values here change and old
 * plays pick them up without a migration. The field, lines, selection and text around the
 * players come from theme tokens instead (`./palette`).
 *
 * Issue #77 retuned these to be colour-blind safe. `tests/player-colours.test.ts` checks them
 * against the field tokens in src/index.css:
 *   - every pair of token colours (and of line colours) stays at least CIEDE2000 ΔE 15 apart in
 *     normal vision and in simulated protanopia, deuteranopia and tritanopia (Machado et al. 2009);
 *   - each token and its line has at least 3:1 contrast against the diagram field and end zone;
 *   - each token's label ink has at least 4.5:1 against the token.
 * The palette is separated by lightness as well as hue (red and blue dark, orange and purple
 * mid, green light, white lightest), because red-green colour blindness flattens hue but keeps
 * lightness. Black is a dark grey: no fill that still reads as black reaches 3:1 on the navy
 * field, so a black token is outlined by the light ring every token gets
 * (`--diagram-token-stroke`), and its line is drawn in `--diagram-line-black`.
 */

/** The seven token colours a coach picks in the play diagram. */
export const TOKEN_COLORS: Record<TokenColor, string> = {
  white: '#ffffff', // raw colour: colour-blind-safe player colour, see #77
  black: '#2a2b2e', // raw colour: colour-blind-safe player colour, see #77
  red: '#c0302f', // raw colour: colour-blind-safe player colour, see #77
  blue: '#4264b2', // raw colour: colour-blind-safe player colour, see #77
  green: '#58d28c', // raw colour: colour-blind-safe player colour, see #77
  orange: '#dc7e00', // raw colour: colour-blind-safe player colour, see #77
  purple: '#b380f8', // raw colour: colour-blind-safe player colour, see #77
}

/** Label on a light token, and the line drawn for a white player when no field colour is given. */
export const TOKEN_DARK_INK = '#1f2328' // raw colour: label ink on light player colours, see #77
/** Label on a dark token. */
export const TOKEN_LIGHT_INK = '#ffffff' // raw colour: label ink on dark player colours, see #77

/** The label ink for each token colour: whichever of the two has at least 4.5:1 on it. */
export const TOKEN_INK: Record<TokenColor, string> = {
  white: TOKEN_DARK_INK,
  black: TOKEN_LIGHT_INK,
  red: TOKEN_LIGHT_INK,
  blue: TOKEN_LIGHT_INK,
  green: TOKEN_DARK_INK,
  orange: TOKEN_DARK_INK,
  purple: TOKEN_DARK_INK,
}

/**
 * 3D jerseys, and the circles and crosses of the no-WebGL preview: one colour per side in both,
 * so the same player looks the same in 2D and 3D. Offense red is dark enough for 3:1 on both
 * 3D turf stripes (#77).
 */
export const TEAM_COLOR: Record<Team, string> = {
  offense: '#b40c28', // raw colour: colour-blind-safe player colour, see #77
  defense: '#f2f2f2', // raw colour: colour-blind-safe player colour, see #77
}

/** The blocky 3D player: sleeve and pant trim, skin and facemask. */
export const TEAM_TRIM: Record<Team, string> = {
  offense: '#7a0a1c', // raw colour: player colour, reviewed in #77
  defense: '#2b2f36', // raw colour: player colour, reviewed in #77
}
export const PLAYER_SKIN = '#d7a37a' // raw colour: player colour, reviewed in #77
export const PLAYER_MASK = '#2a2a2a' // raw colour: player colour, reviewed in #77

/** The SVG play chart's sides: our players and routes, their players and routes. */
export const CHART_SIDE_COLORS = {
  ours: '#f4f1ea', // raw colour: player colour, reviewed in #77
  oursText: '#141414', // raw colour: player colour, reviewed in #77
  oursOutline: '#141414', // raw colour: player colour, reviewed in #77
  theirs: '#ff7a6b', // raw colour: player colour, reviewed in #77
} as const
