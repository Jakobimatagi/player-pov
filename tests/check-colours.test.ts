/** The raw-colour guard (scripts/check-colours.mjs, issue #76), run against throwaway trees. */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const script = fileURLToPath(new URL('../scripts/check-colours.mjs', import.meta.url))
const roots: string[] = []

function check(files: Record<string, string>, baseline?: Record<string, number>) {
  const root = mkdtempSync(join(tmpdir(), 'check-colours-'))
  roots.push(root)
  const all = { ...files }
  if (baseline) all['scripts/colour-baseline.json'] = JSON.stringify({ files: baseline })
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  const run = spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' })
  return { ok: run.status === 0, out: run.stdout + run.stderr }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const THEME = `:root {
  --primary: oklch(0.73 0.18 50);
  --border: #ffffff1c;
}

:root[data-theme='light'] {
  --primary: rgb(200 80 20);
}

.button {
  color: var(--primary);
}
`

describe('check-colours', () => {
  it('passes the theme token blocks, brand.ts and tests', () => {
    const r = check({
      'src/index.css': THEME,
      'src/lib/brand.ts': "export const themeColor = '#0b1220'",
      'src/x.test.ts': "const c = '#ff0000'",
    })
    expect(r.out).toContain('no new raw colours')
    expect(r.ok).toBe(true)
  })

  it('checks the play sheet CSS like any other (it is a screen stylesheet, not print)', () => {
    const r = check({ 'src/playsheet/playsheet.css': '.sheet {\n  color: #000;\n}\n' })
    expect(r.ok).toBe(false)
    expect(r.out).toContain('src/playsheet/playsheet.css:2  raw colour #000')
  })

  it('fails a raw colour in a non-token rule of the theme file', () => {
    const r = check({ 'src/index.css': `${THEME}\n.legacy {\n  color: #ff0000;\n}\n` })
    expect(r.ok).toBe(false)
    expect(r.out).toContain('src/index.css:15  raw colour #ff0000')
  })

  it('fails a new raw colour in feature CSS', () => {
    const r = check({ 'src/team/team.css': '.x {\n  color: #ff0000;\n}\n' })
    expect(r.ok).toBe(false)
    expect(r.out).toContain('src/team/team.css:2  raw colour #ff0000')
  })

  it.each([
    ['hex string', "const c = '#ff0000'"],
    ['short hex', "const c = '#f00'"],
    ['8-digit hex', "const c = '#ff000080'"],
    ['rgba()', "const c = 'rgba(0, 0, 0, 0.5)'"],
    ['hsl()', 'const c = `hsl(10 50% 50%)`'],
    ['oklch()', "const c = 'oklch(0.7 0.1 20)'"],
    ['template part', 'const c = `${a} #ff0000`'],
    ['Tailwind arbitrary value', 'const el = <div className="bg-[#ff0000]" />'],
    ['three.js number', 'const c = 0xff0000'],
  ])('fails a raw colour in TS/TSX: %s', (_, code) => {
    const r = check({ 'src/app/Thing.tsx': `${code}\n` })
    expect(r.ok).toBe(false)
    expect(r.out).toContain('src/app/Thing.tsx:1  raw colour')
  })

  it('ignores comments, JSX text, ids and non-colour hex', () => {
    const r = check({
      'src/app/Thing.tsx': [
        '// the old orange was #ff8800',
        '/* rgb(0 0 0) */',
        'const el = <p>Play #123</p>',
        "const href = '#section-2'",
        "const id = 'abc#def'",
        'const mask = 0xff',
        "const fill = 'var(--primary)'",
      ].join('\n'),
      'src/app/thing.css': '/* was #fff */\n.a { color: var(--foreground); }\n',
    })
    expect(r.out).toContain('no new raw colours')
    expect(r.ok).toBe(true)
  })

  it('accepts a raw colour with a reason on the same line or the line above', () => {
    const r = check({
      'src/app/Thing.tsx': [
        "const a = '#ff0000' // raw colour: WebGL clear colour, read before CSS loads",
        '// raw colour: canvas text needs a literal',
        "const b = '#00ff00'",
      ].join('\n'),
      'src/app/thing.css': '.a {\n  color: #000; /* raw colour: print ink */\n}\n',
    })
    expect(r.ok).toBe(true)
  })

  it('does not accept the exception comment without a reason', () => {
    const r = check({ 'src/app/Thing.tsx': "const a = '#ff0000' // raw colour:\n" })
    expect(r.ok).toBe(false)
  })

  describe('baseline', () => {
    const two = '.a { color: #111; }\n.b { color: #222; }\n'

    it('lets a baselined file keep its count', () => {
      expect(check({ 'src/a.css': two }, { 'src/a.css': 2 }).ok).toBe(true)
    })

    it('fails when a baselined file gains a raw colour', () => {
      const r = check({ 'src/a.css': `${two}.c { color: #333; }\n` }, { 'src/a.css': 2 })
      expect(r.ok).toBe(false)
      expect(r.out).toContain('3 raw colours, baseline allows 2')
    })

    it('prints a notice when a baselined file loses some', () => {
      const r = check({ 'src/a.css': '.a { color: #111; }\n' }, { 'src/a.css': 2 })
      expect(r.ok).toBe(true)
      expect(r.out).toContain('baseline can shrink')
    })

    it('fails when a baselined file is clean, so the entry gets deleted', () => {
      const r = check({ 'src/a.css': '.a { color: var(--primary); }\n' }, { 'src/a.css': 2 })
      expect(r.ok).toBe(false)
      expect(r.out).toContain('delete its entry')
    })
  })
})
