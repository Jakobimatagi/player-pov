import type { TokenColor } from '../diagram/types'
import type { Team } from '../play/types'

/**
 * Every colour that belongs to a player rather than to the theme. They are fixed on purpose:
 * saved plays name the token colours, and issue #77 retunes all of these together (colour-blind
 * safe, readable on the field in 2D and 3D). The field, lines, selection and text around the
 * players come from theme tokens instead (`./palette`).
 */

/** The seven token colours a coach picks in the play diagram, as in the reference swatches. */
export const TOKEN_COLORS: Record<TokenColor, string> = {
  white: '#ffffff', // raw colour: player colour, retuned in #77
  black: '#3a3a3a', // raw colour: player colour, retuned in #77
  red: '#e5473b', // raw colour: player colour, retuned in #77
  blue: '#2d6fe0', // raw colour: player colour, retuned in #77
  green: '#3fae52', // raw colour: player colour, retuned in #77
  orange: '#f0901f', // raw colour: player colour, retuned in #77
  purple: '#8c4fd1', // raw colour: player colour, retuned in #77
}

/** Label on a white token, and the line drawn for a white player when no field colour is given. */
export const TOKEN_DARK_INK = '#1f2328' // raw colour: player colour, retuned in #77
/** Label on every other token. */
export const TOKEN_LIGHT_INK = '#ffffff' // raw colour: player colour, retuned in #77

/** 3D jerseys, and the circles and crosses of the no-WebGL preview. */
export const TEAM_COLOR: Record<Team, string> = {
  offense: '#c8102e', // raw colour: player colour, retuned in #77
  defense: '#f2f2f2', // raw colour: player colour, retuned in #77
}

/** The blocky 3D player: sleeve and pant trim, skin and facemask. */
export const TEAM_TRIM: Record<Team, string> = {
  offense: '#7a0a1c', // raw colour: player colour, retuned in #77
  defense: '#2b2f36', // raw colour: player colour, retuned in #77
}
export const PLAYER_SKIN = '#d7a37a' // raw colour: player colour, retuned in #77
export const PLAYER_MASK = '#2a2a2a' // raw colour: player colour, retuned in #77

/** The SVG play chart's sides: our players and routes, their players and routes. */
export const CHART_SIDE_COLORS = {
  ours: '#f4f1ea', // raw colour: player colour, retuned in #77
  oursText: '#141414', // raw colour: player colour, retuned in #77
  oursOutline: '#141414', // raw colour: player colour, retuned in #77
  theirs: '#ff7a6b', // raw colour: player colour, retuned in #77
} as const
