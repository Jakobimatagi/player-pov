import { describe, expect, it } from 'vitest'
import { diagramFromFormation } from '../src/diagram/formations'
import {
  applyPreset,
  BLANK_LINE,
  clearSide,
  DEFENSE_PRESETS,
  findPreset,
  OFFENSE_PRESETS,
  PRESETS,
  presetDiagram,
} from '../src/diagram/presets'
import { COLOR_HEX, lineHex, onHex } from '../src/diagram/colors'
import {
  fieldView,
  fromStage,
  lineShape,
  LOS_Y,
  MIN_LINE_RADII,
  pointInPolygon,
  pointInRect,
  stagePlacement,
  toScreen,
  ZOOMS,
} from '../src/diagram/geometry'
import {
  blankDiagram,
  createState,
  diagramReducer,
  type DiagramAction,
  type DiagramState,
} from '../src/diagram/model'
import {
  addPlay,
  goTo,
  loadScript,
  newScript,
  positionLabel,
  putDiagram,
  removeAt,
  parseScript,
  saveScript,
  savedScript,
} from '../src/diagram/script'
import { LINE_TYPES } from '../src/diagram/types'

const run = (s: DiagramState, ...a: DiagramAction[]) => a.reduce(diagramReducer, s)
const fresh = () => createState()

describe('blank diagram', () => {
  it('is five linemen on the line, four round and one square center', () => {
    const d = blankDiagram()
    expect(d.players).toHaveLength(5)
    expect(d.players.filter((p) => p.square)).toHaveLength(1)
    expect(d.players.find((p) => p.square)?.id).toBe('p3')
    expect(new Set(d.players.map((p) => p.y)).size).toBe(1)
    expect(d.players.every((p) => p.y > LOS_Y && p.x >= 0 && p.x <= 1)).toBe(true)
  })
})

describe('tokens', () => {
  it('keeps the placement tool, opens the colour popover for circles and triangles only', () => {
    const s = run(
      fresh(),
      { type: 'tool', tool: 'circle' },
      { type: 'addToken', shape: 'circle', at: { x: 0.2, y: 0.3 } },
    )
    expect(s.tool).toBe('circle')
    expect(s.popover).toBe('p6')
    expect(s.selection).toEqual(['p6'])
    const t = run(s, { type: 'addToken', shape: 'text', at: { x: 0.5, y: 0.2 } })
    expect(t.popover).toBeNull()
    expect(t.diagram.players.find((p) => p.id === 'p7')?.label).toBe('Ab')
    expect(t.tool).toBe('circle')
  })

  it('clamps to the field and normalises coordinates', () => {
    const s = run(fresh(), { type: 'addToken', shape: 'circle', at: { x: 4, y: -2 } })
    expect(s.diagram.players[5]).toMatchObject({ x: 1, y: 0 })
  })

  it('splits circles but never triangles, and a colour change recolours the line', () => {
    let s = run(fresh(), { type: 'addToken', shape: 'circle', at: { x: 0.2, y: 0.3 } })
    s = run(s, { type: 'addLine', playerId: 'p6', lineType: 'route', to: { x: 0.2, y: 0.1 } })
    s = run(s, { type: 'setStyle', id: 'p6', color: 'red', fillStyle: 'split' })
    expect(s.diagram.players[5]).toMatchObject({ color: 'red', fillStyle: 'split' })
    expect(s.diagram.lines[0]?.color).toBe('red')
    s = run(s, { type: 'addToken', shape: 'triangle', at: { x: 0.7, y: 0.3 } })
    s = run(s, { type: 'setStyle', id: 'p7', color: 'blue', fillStyle: 'split' })
    expect(s.diagram.players[6]).toMatchObject({ color: 'blue', fillStyle: 'solid' })
  })

  it('edits text, clears an emptied circle label, and removes an emptied text token', () => {
    let s = run(fresh(), { type: 'setText', id: 'p1', text: ' 81 ' })
    expect(s.diagram.players[0]?.label).toBe('81')
    s = run(s, { type: 'setText', id: 'p1', text: '' })
    expect(s.diagram.players[0]).not.toHaveProperty('label')
    s = run(s, { type: 'addToken', shape: 'text', at: { x: 0.5, y: 0.5 } })
    expect(s.diagram.players).toHaveLength(6)
    s = run(s, { type: 'setText', id: 'p6', text: '   ' })
    // Nothing left to draw or click, so the token goes, as one undo step.
    expect(s.diagram.players).toHaveLength(5)
    expect(s.selection).toEqual([])
    expect(run(s, { type: 'undo' }).diagram.players).toHaveLength(6)
  })
})

describe('lines', () => {
  it('replaces a player’s line, inherits its colour, and refuses text tokens', () => {
    let s = run(fresh(), { type: 'setStyle', id: 'p1', color: 'green' })
    s = run(s, { type: 'addLine', playerId: 'p1', lineType: 'route', to: { x: 0.3, y: 0.2 } })
    s = run(s, {
      type: 'addLine',
      playerId: 'p1',
      lineType: 'checkRelease',
      to: { x: 0.35, y: 0.1 },
    })
    expect(s.diagram.lines).toHaveLength(1)
    expect(s.diagram.lines[0]).toMatchObject({ type: 'checkRelease', color: 'green' })
    s = run(s, { type: 'addToken', shape: 'text', at: { x: 0.5, y: 0.5 } })
    const before = s
    expect(
      run(s, { type: 'addLine', playerId: 'p6', lineType: 'route', to: { x: 0.5, y: 0.1 } }),
    ).toBe(before)
  })

  it('draws every one of the seven line types', () => {
    expect(LINE_TYPES).toHaveLength(7)
    const from = { x: 50, y: 200 }
    const to = { x: 50, y: 80 }
    const shapes = Object.fromEntries(LINE_TYPES.map((t) => [t, lineShape(t, from, to, 10)]))
    expect(shapes.route?.arrow).toBeDefined()
    expect(shapes.route?.parts[0]?.dash).toBeUndefined()
    expect(shapes.dashedRoute?.arrow).toBeDefined()
    expect(shapes.dashedRoute?.parts[0]?.dash).toBeDefined()
    expect(shapes.block?.arrow).toBeUndefined()
    expect(shapes.block?.parts).toHaveLength(2)
    expect(shapes.path?.parts).toHaveLength(1)
    expect(shapes.path?.arrow).toBeUndefined()
    expect((shapes.motion?.parts[0]?.points.length ?? 0) > 8).toBe(true)
    expect(shapes.segmentedBlock?.parts).toHaveLength(3)
    expect(shapes.segmentedBlock?.parts[0]?.dash?.length).toBe(4)
    expect(shapes.checkRelease?.dot).toBeDefined()
    expect(shapes.checkRelease?.arrow).toBeUndefined()
  })

  it('draws nothing for a drag shorter than the token', () => {
    expect(lineShape('route', { x: 0, y: 0 }, { x: 3, y: 0 }, 10).parts).toEqual([])
  })
})

describe('select, move, delete, undo', () => {
  it('moves a token with its line as one undo step, and a no-op drag leaves none', () => {
    let s = run(fresh(), {
      type: 'addLine',
      playerId: 'p1',
      lineType: 'route',
      to: { x: 0.4, y: 0.2 },
    })
    const start = s.diagram.players[0]
    s = run(
      s,
      { type: 'moveBegin' },
      // Each event carries the total move since the press.
      { type: 'moveBy', ids: ['p1'], dx: 0.05, dy: -0.1 },
      { type: 'moveBy', ids: ['p1'], dx: 0.1, dy: -0.2 },
      { type: 'moveEnd' },
    )
    expect(s.diagram.players[0]?.x).toBeCloseTo((start?.x ?? 0) + 0.1)
    expect(s.diagram.lines[0]?.points[0]?.x).toBeCloseTo(0.5)
    const back = run(s, { type: 'undo' })
    expect(back.diagram.players[0]).toEqual(start)
    expect(run(fresh(), { type: 'moveBegin' }, { type: 'moveEnd' }).past).toHaveLength(0)
  })

  it('deleting a token takes its line, and undo brings both back', () => {
    let s = run(fresh(), {
      type: 'addLine',
      playerId: 'p2',
      lineType: 'block',
      to: { x: 0.4, y: 0.2 },
    })
    s = run(s, { type: 'select', ids: ['p2'] }, { type: 'delete' })
    expect(s.diagram.players).toHaveLength(4)
    expect(s.diagram.lines).toHaveLength(0)
    expect(s.selection).toEqual([])
    const undone = run(s, { type: 'undo' })
    expect(undone.diagram.players).toHaveLength(5)
    expect(undone.diagram.lines).toHaveLength(1)
    expect(run(undone, { type: 'redo' }).diagram.players).toHaveLength(4)
  })

  it('selects additively and sets a note', () => {
    let s = run(
      fresh(),
      { type: 'select', ids: ['p1'] },
      { type: 'select', ids: ['p2'], additive: true },
    )
    expect(s.selection).toEqual(['p1', 'p2'])
    s = run(s, { type: 'select', ids: ['p1'], additive: true })
    expect(s.selection).toEqual(['p2'])
    s = run(
      s,
      { type: 'addNote', at: { x: 0.5, y: 0.5 } },
      { type: 'setText', id: 'n1', text: 'Motion at 2' },
    )
    expect(s.diagram.notes[0]).toMatchObject({ id: 'n1', text: 'Motion at 2' })
  })

  it('area and lasso hit tests', () => {
    expect(pointInRect({ x: 0.5, y: 0.5 }, { x: 0.8, y: 0.8 }, { x: 0.2, y: 0.2 })).toBe(true)
    expect(pointInRect({ x: 0.1, y: 0.5 }, { x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 })).toBe(false)
    const tri = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0.5, y: 1 },
    ]
    expect(pointInPolygon({ x: 0.5, y: 0.3 }, tri)).toBe(true)
    expect(pointInPolygon({ x: 0.1, y: 0.9 }, tri)).toBe(false)
  })
})

describe('field view', () => {
  it('moves the numbers with the preset and never the diagram', () => {
    const mid = fieldView('midfield')
    expect(mid.marks.filter((m) => m.label != null).map((m) => m.label)).toContain(50)
    const goal = fieldView('goalline')
    expect(goal.marks.some((m) => m.kind === 'goal')).toBe(true)
    expect(goal.endZones.length).toBeGreaterThan(0)
    const backed = fieldView('backedUp')
    expect(backed.endZones.some((z) => z.y1 === 1)).toBe(true)
    const d = blankDiagram()
    run(createState(d))
    expect(createState(d).diagram).toBe(d)
  })
})

describe('formations', () => {
  it('maps a base alignment into the field, with a square center and coloured skill', () => {
    const d = diagramFromFormation('trips-rt')
    expect(d.players).toHaveLength(11)
    expect(d.players.find((p) => p.square)).toBeDefined()
    expect(d.players.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)).toBe(true)
    const z = d.players.find((p) => p.label === 'Z')
    expect(z?.color).toBe('blue')
    const qb = d.players.find((p) => p.label === 'QB')
    expect(qb?.y).toBeGreaterThan(LOS_Y)
    expect(diagramFromFormation(null).players).toHaveLength(5)
    expect(diagramFromFormation('nope').players).toHaveLength(5)
  })
})

describe('script', () => {
  const store = () => {
    const map = new Map<string, string>()
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    }
  }

  it('navigates, adds from a base, removes, and labels', () => {
    let sc = newScript()
    expect(positionLabel(sc)).toBe('Play 1 of 1')
    sc = addPlay(sc, diagramFromFormation('pro-rt'))
    expect(positionLabel(sc)).toBe('Play 2 of 2')
    expect(sc.plays[1]?.diagram.players).toHaveLength(11)
    expect(goTo(sc, 0).index).toBe(0)
    expect(removeAt(sc, 0).plays).toHaveLength(1)
    expect(removeAt(newScript(), 0).plays).toHaveLength(1)
  })

  it('writes every edit through and reads it back, ignoring junk', () => {
    const st = store()
    const sc = putDiagram(
      newScript(),
      run(fresh(), { type: 'addNote', at: { x: 0.5, y: 0.5 } }).diagram,
    )
    expect(savedScript('k', st)).toBeNull()
    expect(saveScript('k', sc, st)).toBe(true)
    expect(loadScript('k', st).plays[0]?.diagram.notes).toHaveLength(1)
    st.setItem('bad', '{"plays":[]}')
    expect(loadScript('bad', st).plays).toHaveLength(1)
    st.setItem('worse', 'not json')
    expect(loadScript('worse', st).plays[0]?.name).toBe('Play 1')
    expect(saveScript('k', sc, null)).toBe(false)
  })
})

describe('view: flip and zoom', () => {
  const base = { width: 800, height: 520, zoom: 1, flip: false }

  it('maps a diagram point to the screen and back, through flip and zoom', () => {
    for (const flip of [false, true]) {
      for (const zoom of ZOOMS) {
        const view = { ...base, zoom, flip }
        const p = { x: 0.3, y: 0.7 }
        const screen = toScreen(p, view)
        // The Stage's own canvas is the screen point undone from its zoom placement.
        const place = stagePlacement(view)
        const onStage = { x: (screen.x - place.x) / zoom, y: (screen.y - place.y) / zoom }
        const back = fromStage(onStage, view)
        expect(back.x).toBeCloseTo(p.x)
        expect(back.y).toBeCloseTo(p.y)
      }
    }
  })

  it('mirrors left and right on flip and holds the line of scrimmage under zoom', () => {
    expect(toScreen({ x: 0.2, y: 0.5 }, { ...base, flip: true }).x).toBeCloseTo(0.8 * base.width)
    for (const zoom of ZOOMS) {
      const at = toScreen({ x: 0.5, y: LOS_Y }, { ...base, zoom })
      expect(at.x).toBeCloseTo(base.width / 2)
      expect(at.y).toBeCloseTo(LOS_Y * base.height)
    }
  })
})

describe('replace and colours', () => {
  it('swaps the diagram as one undoable edit and ignores the same one', () => {
    const s = fresh()
    const next = diagramFromFormation('pro-rt')
    const swapped = run(s, { type: 'select', ids: ['p1'] }, { type: 'replace', diagram: next })
    expect(swapped.diagram).toBe(next)
    expect(swapped.selection).toEqual([])
    expect(run(swapped, { type: 'undo' }).diagram).toBe(s.diagram)
    expect(run(swapped, { type: 'replace', diagram: next })).toBe(swapped)
  })

  it('keeps the reference palette, draws a white player dark and reads on every colour', () => {
    expect(COLOR_HEX.red).toBe('#c0302f')
    expect(lineHex('white')).not.toBe(COLOR_HEX.white)
    expect(lineHex('blue')).toBe(COLOR_HEX.blue)
    expect(onHex('white')).toBe('#1f2328')
    expect(onHex('purple')).toBe('#1f2328')
    expect(onHex('red')).toBe('#ffffff')
  })
})

describe('formation presets', () => {
  it('has 11 players per formation, unique slots and keys, and every spot on the field', () => {
    expect(OFFENSE_PRESETS.length).toBeGreaterThanOrEqual(8)
    expect(DEFENSE_PRESETS.length).toBeGreaterThanOrEqual(6)
    expect(new Set(PRESETS.map((p) => p.key)).size).toBe(PRESETS.length)
    for (const preset of PRESETS) {
      expect(preset.spots, preset.name).toHaveLength(11)
      expect(new Set(preset.spots.map((spot) => spot.slot)).size, preset.name).toBe(11)
      const d = presetDiagram(preset)
      expect(new Set(d.players.map((p) => p.id)).size).toBe(11)
      for (const p of d.players) {
        expect(p.x).toBeGreaterThan(0)
        expect(p.x).toBeLessThan(1)
        expect(p.y).toBeGreaterThan(0)
        expect(p.y).toBeLessThan(1)
      }
    }
  })

  it('puts offense at or behind the line of scrimmage and defense in front of it', () => {
    for (const preset of OFFENSE_PRESETS) {
      expect(
        presetDiagram(preset).players.every((p) => p.y >= LOS_Y),
        preset.name,
      ).toBe(true)
    }
    for (const preset of DEFENSE_PRESETS) {
      expect(
        presetDiagram(preset).players.every((p) => p.y < LOS_Y),
        preset.name,
      ).toBe(true)
    }
  })

  it('keeps the old base-alignment keys, and Trips Left is Trips Right mirrored', () => {
    for (const key of ['trips-rt', 'gun-spread', 'pro-rt']) {
      expect(findPreset(key)?.side).toBe('offense')
    }
    const right = presetDiagram(findPreset('trips-rt')!).players
    const left = presetDiagram(findPreset('trips-lt')!).players
    right.forEach((p, i) => expect(left[i]?.x).toBeCloseTo(1 - p.x))
  })

  it('draws linemen plain with a square center, and defenders as dark labelled tokens', () => {
    const offense = presetDiagram(findPreset('i-form')!).players
    expect(offense.filter((p) => p.square)).toHaveLength(1)
    expect(offense.find((p) => p.id === 'p1')).not.toHaveProperty('label')
    expect(offense.every((p) => p.side === 'offense')).toBe(true)
    const defense = presetDiagram(findPreset('d-43')!).players
    expect(defense.every((p) => p.color === 'black' && p.side === 'defense')).toBe(true)
    expect(defense.every((p) => p.label != null && p.label.length <= 2)).toBe(true)
  })

  it('setting an offense replaces the offense but keeps the defense, text and notes', () => {
    const withDefense = applyPreset(blankDiagram(), findPreset('d-34')!)
    expect(withDefense.players).toHaveLength(5 + 11)
    let s = run(createState(withDefense), {
      type: 'addToken',
      shape: 'text',
      at: { x: 0.5, y: 0.1 },
    })
    s = run(s, { type: 'addNote', at: { x: 0.2, y: 0.2 } })
    const next = applyPreset(s.diagram, findPreset('gun-spread')!)
    expect(next.players.filter((p) => p.side === 'defense')).toHaveLength(11)
    expect(next.players.filter((p) => p.side === 'offense')).toHaveLength(11)
    expect(next.players.filter((p) => p.shape === 'text')).toHaveLength(1)
    expect(next.notes).toHaveLength(1)
    expect(next.formation).toBe('Gun Spread')
    expect(new Set([...next.players, ...next.lines, ...next.notes].map((i) => i.id)).size).toBe(
      next.players.length + next.lines.length + next.notes.length,
    )
  })

  it('setting a defense replaces only the defense, and removed players take their lines', () => {
    let s = run(createState(blankDiagram()), {
      type: 'addLine',
      playerId: 'p1',
      lineType: 'block',
      to: { x: 0.3, y: 0.4 },
    })
    s = run(s, { type: 'replace', diagram: applyPreset(s.diagram, findPreset('d-43')!) })
    s = run(s, { type: 'replace', diagram: applyPreset(s.diagram, findPreset('d-cover2')!) })
    expect(s.diagram.players.filter((p) => p.side === 'defense')).toHaveLength(11)
    expect(s.diagram.players.filter((p) => p.side !== 'defense')).toHaveLength(5)
    expect(s.diagram.lines).toHaveLength(1)
    const offenseAgain = applyPreset(s.diagram, findPreset('ace')!)
    expect(offenseAgain.lines).toHaveLength(0)
  })

  it('applies as one undo step and can clear a side', () => {
    const s = run(createState(blankDiagram()), {
      type: 'replace',
      diagram: applyPreset(blankDiagram(), findPreset('d-425')!),
    })
    expect(run(s, { type: 'undo' }).diagram.players).toHaveLength(5)
    const cleared = clearSide(s.diagram, 'defense')
    expect(cleared.players).toHaveLength(5)
    expect(clearSide(cleared, 'defense')).toBe(cleared)
    expect(clearSide(s.diagram, 'offense').players).toHaveLength(11)
  })

  it('blank line is five linemen, and a stored side survives a save and load', () => {
    expect(
      applyPreset({ formation: '', players: [], lines: [], notes: [] }, BLANK_LINE).players,
    ).toHaveLength(5)
    const d = applyPreset(blankDiagram(), findPreset('d-44')!)
    const script = { plays: [{ id: 'play-1', name: 'x', diagram: d }], index: 0 }
    const back = parseScript(JSON.parse(JSON.stringify(script)))
    expect(back?.plays[0]?.diagram.players.filter((p) => p.side === 'defense')).toHaveLength(11)
  })
})

describe('moving at the field edge', () => {
  const drag = (s: DiagramState, ids: string[], ...moves: [number, number][]) =>
    run(
      s,
      { type: 'moveBegin' },
      ...moves.map(([dx, dy]): DiagramAction => ({ type: 'moveBy', ids, dx, dy })),
      { type: 'moveEnd' },
    )

  it('keeps a group in shape when part of it hits the edge', () => {
    const before = fresh().diagram.players
    const s = drag(fresh(), ['p1', 'p2', 'p3', 'p4', 'p5'], [0.9, 0])
    const after = s.diagram.players
    // The rightmost token stops at the edge and the rest stop with it, spacing intact.
    expect(Math.max(...after.map((p) => p.x))).toBeCloseTo(1)
    for (let i = 1; i < 5; i += 1) {
      expect((after[i]?.x ?? 0) - (after[i - 1]?.x ?? 0)).toBeCloseTo(
        (before[i]?.x ?? 0) - (before[i - 1]?.x ?? 0),
      )
    }
  })

  it('brings a token back with the cursor instead of leaving it behind', () => {
    const start = fresh().diagram.players[0]?.x ?? 0
    // Push well past the edge, then come back to 0.1 right of where the press began.
    const s = drag(fresh(), ['p1'], [2, 0], [0.1, 0])
    expect(s.diagram.players[0]?.x).toBeCloseTo(start + 0.1)
  })

  it('moves a route with its player and clamps them together', () => {
    let s = run(fresh(), {
      type: 'addLine',
      playerId: 'p5',
      lineType: 'route',
      to: { x: 0.9, y: 0.2 },
    })
    s = drag(s, ['p5'], [0.5, 0])
    const player = s.diagram.players[4]
    const end = s.diagram.lines[0]?.points[0]
    expect(Math.max(player?.x ?? 0, end?.x ?? 0)).toBeCloseTo(1)
    expect((end?.x ?? 0) - (player?.x ?? 0)).toBeCloseTo(0.9 - 0.62)
  })
})

describe('line length', () => {
  it('draws nothing under the shared minimum, so the editor can refuse to add one', () => {
    const unit = 13
    const below = unit * MIN_LINE_RADII * 0.95
    const above = unit * MIN_LINE_RADII * 1.05
    expect(lineShape('route', { x: 0, y: 0 }, { x: below, y: 0 }, unit).parts).toEqual([])
    expect(
      lineShape('route', { x: 0, y: 0 }, { x: 0, y: above }, unit).parts.length,
    ).toBeGreaterThan(0)
  })
})

describe('preset previews', () => {
  it('hand back the same diagram each time so a preview can skip re-rendering', () => {
    const preset = findPreset('d-43')!
    expect(presetDiagram(preset)).toBe(presetDiagram(preset))
  })
})
