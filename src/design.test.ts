/**
 * F2 guard: one colour system. The app's stylesheets and components may only use the AID
 * tokens (black surfaces, violet for action/selection, green/amber/red for meaning). Catches the
 * leftovers removed in the design pass: the old lime/teal "Calm Urgency" accents, the blue/indigo
 * and emerald/teal Tailwind palettes on buttons and sheets, gradient fills and the glass utilities.
 */
// @ts-ignore -- Node built-in, available in the Vitest runner (the app tsconfig has no Node types).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

declare const process: { cwd(): string }
const read = (path: string): string => readFileSync(`${process.cwd()}/${path}`, 'utf8')
const css = { 'src/rebrand.css': read('src/rebrand.css'), 'src/index.css': read('src/index.css') }

const tsx = import.meta.glob(['./**/*.tsx', '!./**/*.test.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>

/** Screens not yet moved onto the design system. Shrinks to empty as each area is migrated. */
const NOT_YET_MIGRATED: string[] = []

describe('one colour system (F2)', () => {
  it('no leftover lime / teal accents or glass utilities in the app stylesheets', () => {
    for (const [name, text] of Object.entries(css)) {
      expect(text, name).not.toMatch(/rgba\(\s*(223,\s*255,\s*84|202,\s*244,\s*45|138,\s*232,\s*227|32,\s*39,\s*34|41,\s*49,\s*41)\b/)
      expect(text, name).not.toMatch(/#101613|#111712|#c8d0ca|#cbd2cc|#7e8781|#808983|#bdc5bf/i)
      expect(text, name).not.toMatch(/\.glass\b|\.glass-|icon-glow|gradient-text|shine-effect/)
    }
  })

  it('components use the design tokens, not off-system Tailwind colours or gradient fills', () => {
    const offSystem = /\b(?:bg|text|border|from|to|via|shadow|ring|placeholder)-(?:blue|sky|indigo|emerald|teal|green|cyan|gray|slate|zinc|amber|yellow|orange|red|violet|purple)-\d{2,3}\b|bg-gradient-to-|from-\[#|to-\[#|bg-\[#/
    const hits = Object.entries(tsx).filter(([file, text]) => !NOT_YET_MIGRATED.includes(file) && offSystem.test(text)).map(([file]) => file)
    expect(hits).toEqual([])
  })

  it('the allow-list only names files that still exist', () => {
    for (const file of NOT_YET_MIGRATED) expect(Object.keys(tsx)).toContain(file)
  })
})

/**
 * Owner rule (redesign, 2026-10-22): no glow. Flat near-black, solid violet primary — no coloured
 * blurred shadows, no gradients with colour in them (neutral black fades over a map are fine).
 */
const COLOR = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi
function chromatic(color: string): boolean {
  let r: number, g: number, b: number
  if (color.startsWith('#')) {
    const hex = color.slice(1)
    const full = hex.length <= 4 ? hex.split('').map((c) => c + c).join('') : hex
    ;[r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
  } else {
    ;[r, g, b] = color.replace(/rgba?\(/, '').split(',').slice(0, 3).map((v) => parseFloat(v))
  }
  return Math.max(r, g, b) - Math.min(r, g, b) > 12
}
/** Every `box-shadow` with a blur and every gradient whose colours aren't neutral grey/black. */
function glowViolations(text: string): string[] {
  const hits: string[] = []
  for (const match of text.matchAll(/box-shadow:\s*([^;}]+)/g)) {
    for (const layer of match[1].split(/,(?![^(]*\))/)) {
      const lengths = layer.replace(COLOR, '').match(/-?[\d.]+px|\b0\b/g) ?? []
      const blur = parseFloat(lengths[2] ?? '0')
      const spread = parseFloat(lengths[3] ?? '0')
      const colours = layer.match(COLOR) ?? []
      // A blurred colour is a glow; a wide coloured spread is a halo. A thin (≤2px) solid ring is fine.
      if (!/inset/.test(layer) && (blur > 0 || spread > 2) && colours.some(chromatic)) hits.push(`box-shadow ${layer.trim()}`)
    }
  }
  for (const match of text.matchAll(/(?:linear|radial|conic)-gradient\(((?:[^()]|\([^()]*\))*)\)/g)) {
    if ((match[1].match(COLOR) ?? []).some(chromatic)) hits.push(`gradient ${match[0].slice(0, 80)}`)
  }
  return hits
}

describe('no glow (owner correction)', () => {
  it('the detector catches glow and allows flat shadows', () => {
    expect(glowViolations('.a { box-shadow: 0 4px 14px rgba(124,58,237,.55); }')).toHaveLength(1)
    expect(glowViolations('.a { background: linear-gradient(135deg, #8b5cf6, #6d28d9); }')).toHaveLength(1)
    expect(glowViolations('.a { box-shadow: 0 6px 18px rgba(0, 0, 0, .45); background: linear-gradient(to bottom, transparent, rgba(11, 11, 15, .55)); }')).toEqual([])
    expect(glowViolations('.a { box-shadow: inset 2px 0 0 #7c3aed; }')).toEqual([])
  })

  it('app stylesheets have no coloured glows, halos or gradient fills', () => {
    for (const [name, text] of Object.entries(css)) expect(glowViolations(text), name).toEqual([])
  })

  // Design standards checklist (A4/A5/K76): dark mode layers with tone + 8% hairlines, zero drop
  // shadows; skeletons are flat blocks with no shimmer.
  it('no drop shadows (depth comes from surface tone and hairline borders) and no shimmer skeletons', () => {
    for (const [name, text] of Object.entries(css)) {
      const drops = [...text.matchAll(/box-shadow:\s*([^;}]+)/g)].map((m) => m[1].trim())
        .filter((value) => value !== 'none' && !/^var\(--aid-shadow/.test(value) && value.split(/,(?![^(]*\))/).some((layer) => {
          const lengths = layer.replace(COLOR, '').match(/-?[\d.]+px|\b0\b/g) ?? []
          return !/inset/.test(layer) && parseFloat(lengths[2] ?? '0') > 0
        }))
      expect(drops, name).toEqual([])
      expect(text, name).not.toMatch(/--aid-shadow-[a-z]+:(?!\s*none)/)
    }
    expect(css['src/rebrand.css']).not.toMatch(/\.ui-skeleton\s*\{[^}]*(gradient|animation)/)
  })

  it('design-standards tokens: #000 base, #1C1C1F cards/sheets, #6E56CF button fill, #9D8CFF violet text, tabular digits', () => {
    const root = css['src/rebrand.css']
    expect(root).toMatch(/--aid-ink:\s*#000000/i)
    expect(root).toMatch(/--aid-surface-1:\s*#1c1c1f/i)
    expect(root).toMatch(/--aid-signal:\s*#6e56cf/i)
    expect(root).toMatch(/--aid-signal-strong:\s*#9d8cff/i)
    expect(root).toMatch(/font-variant-numeric:\s*tabular-nums/)
    // Three weights: 400 / 500 / 600–700.
    const weights = new Set([...root.matchAll(/font-weight:\s*(\d+)/g)].map((m) => m[1]))
    expect([...weights].filter((w) => !['400', '500', '600', '700'].includes(w))).toEqual([])
  })
})

describe('one icon set, one stroke weight', () => {
  const admin = ['AdminApp.tsx', 'Reports.tsx', 'FilterTabs.tsx', 'ui.tsx', 'TwoStep.tsx'].map((file) => [`admin/src/${file}`, read(`admin/src/${file}`)] as const)
  const all = [...Object.entries(tsx), ...admin]

  it('every icon comes from lucide-react (no second icon library)', () => {
    const other = /from ['"](?:react-icons|@heroicons|@phosphor-icons|@tabler\/icons|react-feather|@radix-ui\/react-icons)/
    expect(all.filter(([, text]) => other.test(text)).map(([file]) => file)).toEqual([])
  })

  it('icons keep lucide\'s one stroke weight (2); only the bold check mark inside a selected choice is heavier', () => {
    const odd: string[] = []
    for (const [file, text] of all) {
      for (const match of text.matchAll(/strokeWidth=\{?["']?([\d.]+)/g)) {
        const line = text.slice(text.lastIndexOf('\n', match.index) + 1, text.indexOf('\n', match.index))
        const allowed = match[1] === '2' || (match[1] === '3' && /<Check size=\{14\}/.test(line)) || (match[1] === '3.8' && /M8\.6 25/.test(text.slice(match.index! - 80, match.index)))
        if (!allowed) odd.push(`${file}: strokeWidth ${match[1]}`)
      }
    }
    expect(odd).toEqual([])
  })
})
