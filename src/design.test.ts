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
