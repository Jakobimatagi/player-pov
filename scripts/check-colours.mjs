#!/usr/bin/env node
// Raw-colour guard (issue #76). Runs in `npm run lint`.
//
// Every colour in app code comes from a theme token in src/index.css (Tailwind `bg-primary`,
// `text-muted-foreground`, or `var(--token)` in CSS). This script fails when a raw colour literal
// shows up anywhere else under src/:
//   - hex: #abc, #abcd, #aabbcc, #aabbccdd (also inside Tailwind arbitrary values like bg-[#fff])
//   - colour functions: rgb() rgba() hsl() hsla() hwb() lab() lch() oklab() oklch()
//   - 0xRRGGBB numbers in TS/TSX (three.js / Konva colours)
//
// In TS/TSX only string, template and numeric literals are checked (parsed with the TypeScript
// compiler), so comments, identifiers and JSX text never trip it. In CSS, comments are skipped.
//
// Allowed without a comment:
//   - the token blocks of the theme file (`:root { … }`, `:root[data-theme='…'] { … }` and
//     `.dark { … }` in src/index.css). The rest of that file is checked like any other.
//   - src/playsheet/playsheet.css (print sheet: fixed ink colours on paper)
//   - src/lib/brand.ts (the <meta name="theme-color"> value, read before CSS loads)
//   - test files (*.test.ts[x]); tests/ is outside src/ and never scanned
// Allowed with a reason, on the same line or the line directly above:
//   CSS:  color: #000; /* raw colour: print ink must stay black */
//   TS:   // raw colour: WebGL clear colour, read before CSS loads
//
// Baseline: scripts/colour-baseline.json lists files that still had raw colours when the guard
// landed, with how many. A baselined file fails if its count goes UP (no new raw colours there
// either) or reaches zero (delete its entry, so the list only shrinks). A lower, non-zero count
// prints a notice; run `node scripts/check-colours.mjs --update-baseline` to lock it in.
//
// Usage: node scripts/check-colours.mjs [--root <dir>] [--update-baseline]

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const args = process.argv.slice(2)
const rootArg = args.indexOf('--root')
const ROOT = rootArg >= 0 ? args[rootArg + 1] : fileURLToPath(new URL('..', import.meta.url))
const UPDATE = args.includes('--update-baseline')
const BASELINE_PATH = join(ROOT, 'scripts', 'colour-baseline.json')

const THEME_FILE = 'src/index.css'
const ALLOWED_FILES = new Set(['src/playsheet/playsheet.css', 'src/lib/brand.ts'])
const isTest = (f) => /\.test\.tsx?$/.test(f)

const HEX = /(?<![\w&#])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi
const FUNC = /(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/gi
const HEX_NUMBER = /^0x[0-9a-f]{6}$/i
const EXCEPTION = /raw colour:\s*\S/

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(path))
    else if (/\.(css|tsx?)$/.test(entry.name)) out.push(path)
  }
  return out
}

/** Line numbers (1-based) of the theme's token blocks, which may hold raw colours. */
function tokenBlockLines(lines) {
  const allowed = new Set()
  let inside = false
  lines.forEach((line, i) => {
    if (/^(?::root(?:\[[^\]]*\])?|\.dark)\s*\{\s*$/.test(line)) inside = true
    if (inside) allowed.add(i + 1)
    if (inside && /^\}\s*$/.test(line)) inside = false
  })
  return allowed
}

/** Raw colours in a CSS file as [line, match] pairs; comments are blanked out first. */
function scanCss(text) {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
  const hits = []
  code.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(HEX)) hits.push([i + 1, m[0]])
    for (const m of line.matchAll(FUNC)) hits.push([i + 1, m[0]])
  })
  return hits
}

/** Raw colours in string, template and numeric literals of a TS/TSX file. */
function scanTs(text, file) {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)
  const hits = []
  const lineOf = (pos) => source.getLineAndCharacterOfPosition(pos).line + 1
  const visit = (node) => {
    const literal =
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    if (literal) {
      // Report on the line of the match, which matters for multi-line template literals.
      const raw = node.getText(source)
      const start = node.getStart(source)
      for (const re of [HEX, FUNC]) {
        for (const m of raw.matchAll(re)) hits.push([lineOf(start + m.index), m[0]])
      }
    } else if (ts.isNumericLiteral(node) && HEX_NUMBER.test(node.getText(source))) {
      hits.push([lineOf(node.getStart(source)), node.getText(source)])
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return hits
}

/** Unexcused raw colours per file, relative to ROOT with forward slashes. */
export function scan(root = ROOT) {
  const results = new Map()
  const src = join(root, 'src')
  if (!existsSync(src)) return results
  for (const path of walk(src).sort()) {
    const file = relative(root, path).split(sep).join('/')
    if (ALLOWED_FILES.has(file) || isTest(file)) continue
    const text = readFileSync(path, 'utf8')
    const lines = text.split('\n')
    const blocks = file === THEME_FILE ? tokenBlockLines(lines) : new Set()
    const hits = (file.endsWith('.css') ? scanCss(text) : scanTs(text, file)).filter(
      ([line]) =>
        !blocks.has(line) &&
        !EXCEPTION.test(lines[line - 1] ?? '') &&
        !EXCEPTION.test(lines[line - 2] ?? ''),
    )
    if (hits.length > 0) results.set(file, hits)
  }
  return results
}

function readBaseline() {
  if (!existsSync(BASELINE_PATH)) return {}
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).files ?? {}
}

function writeBaseline(results) {
  const files = Object.fromEntries([...results].map(([file, hits]) => [file, hits.length]))
  const body = {
    note:
      'Temporary: files that still contain raw colours, with how many. Remove entries as #74 ' +
      '(CSS) and #75 (diagram/editor/3D TS) land; #80 empties this. Never add to it: use a theme ' +
      'token, or a "raw colour: <reason>" comment for a real exception. See scripts/check-colours.mjs.',
    files,
  }
  writeFileSync(BASELINE_PATH, `${JSON.stringify(body, null, 2)}\n`)
  return files
}

function main() {
  const results = scan()
  if (UPDATE) {
    const files = writeBaseline(results)
    console.log(`Wrote ${Object.keys(files).length} files to ${relative(ROOT, BASELINE_PATH)}`)
    return
  }
  const baseline = readBaseline()
  const errors = []
  const notices = []
  for (const [file, hits] of results) {
    const allowed = baseline[file]
    if (allowed === undefined) {
      for (const [line, match] of hits) {
        errors.push(`${file}:${line}  raw colour ${match}`)
      }
    } else if (hits.length > allowed) {
      errors.push(
        `${file}: ${hits.length} raw colours, baseline allows ${allowed}. Find the new one(s) among:\n` +
          hits.map(([line, match]) => `    ${file}:${line}  ${match}`).join('\n'),
      )
    } else if (hits.length < allowed) {
      notices.push(`${file}: ${hits.length} raw colours left (baseline ${allowed})`)
    }
  }
  for (const file of Object.keys(baseline)) {
    if (!results.has(file)) {
      errors.push(
        `${file} has no raw colours left: delete its entry from scripts/colour-baseline.json`,
      )
    }
  }
  if (notices.length > 0) {
    console.log(
      `check-colours: baseline can shrink (run node scripts/check-colours.mjs --update-baseline):\n  ${notices.join('\n  ')}`,
    )
  }
  if (errors.length > 0) {
    console.error(
      `check-colours: raw colour literals outside the theme. Use a theme token from ${THEME_FILE} ` +
        '(e.g. text-primary, var(--muted-foreground)), or add a "raw colour: <reason>" comment for ' +
        `a genuine exception.\n  ${errors.join('\n  ')}`,
    )
    process.exitCode = 1
    return
  }
  const total = Object.values(baseline).reduce((a, b) => a + b, 0)
  console.log(
    `check-colours: no new raw colours (${Object.keys(baseline).length} baselined files, ${total} known).`,
  )
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
