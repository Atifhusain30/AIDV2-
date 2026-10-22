/**
 * F4 CSS / markup audit — the parts of accessibility jsdom can't render: text never smaller than
 * 12 px and sized in rem (so it follows the phone's text size), text colours that meet WCAG AA
 * (4.5:1) on the app's dark surfaces, no low-contrast Tailwind greys, pinch-zoom allowed, and
 * reduced motion respected. Touch targets and real contrast are also checked in a browser with
 * scripts/a11y-browser-audit.js.
 */
// @ts-ignore -- Node built-in, available in the Vitest runner (the app tsconfig has no Node types).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

declare const process: { cwd(): string }
// Read from disk: Vitest blanks CSS imports (even ?raw) unless CSS processing is on.
const read = (path: string): string => readFileSync(`${process.cwd()}/${path}`, 'utf8')
const rebrandCss = read('src/rebrand.css')
const indexCss = read('src/index.css')
const adminCss = read('admin/src/admin.css')
const indexHtml = read('index.html')
const adminHtml = read('admin/index.html')
const mainTsx = read('src/main.tsx')

const tsx = import.meta.glob(['./**/*.tsx', '!./**/*.test.tsx'], {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

const luminance = (hex: string) => {
  const n = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
/** The app's dark surfaces, from the page background up to the lightest card. */
const SURFACES = ['#07050a', '#110d16', '#141019', '#17121d', '#1b1523', '#1f1828']

describe('text size (F4)', () => {
  it('no app text smaller than 12px, and none sized in px except form fields', () => {
    for (const [name, css] of [['rebrand.css', rebrandCss], ['index.css', indexCss]] as const) {
      const tooSmall = [...css.matchAll(/font-size:\s*(\d*\.?\d+)rem/g)].filter((m) => parseFloat(m[1]) < 0.75).map((m) => m[0])
      expect(tooSmall, name).toEqual([])
      const pxSizes = [...css.matchAll(/font-size:\s*([^;]*\d+px[^;]*)/g)].map((m) => m[1].trim())
      expect(pxSizes.every((value) => value.startsWith('max(16px, 1rem)')), `${name}: ${pxSizes.join(', ')}`).toBe(true)
    }
    const tinyClasses = Object.entries(tsx).filter(([, text]) => /text-\[(?:[0-9]|1[01])px\]/.test(text)).map(([file]) => file)
    expect(tinyClasses).toEqual([])
  })

  it('admin text is at least 12px', () => {
    const tooSmall = [...adminCss.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].filter((m) => parseFloat(m[1]) < 12).map((m) => m[0])
    expect(tooSmall).toEqual([])
  })

  it('pinch-zoom is allowed', () => {
    for (const html of [indexHtml, adminHtml]) {
      expect(html).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/)
      expect(html).toMatch(/<html lang="en">/)
    }
  })
})

describe('colour contrast (F4, WCAG AA)', () => {
  it('every solid text colour in the app stylesheet is 4.5:1 on all dark surfaces', () => {
    const failing = [...rebrandCss.matchAll(/(?:^|[\s;{])color:\s*(#[0-9a-fA-F]{6})\b/g)]
      .map((m) => m[1].toLowerCase())
      // Dark text is only used on light/coloured fills (e.g. the green "done" step).
      .filter((hex) => luminance(hex) < 0.4 && hex !== '#062b1d')
      .filter((hex) => Math.min(...SURFACES.map((bg) => contrast(hex, bg))) < 4.5)
    expect([...new Set(failing)]).toEqual([])
  })

  it('purple fills carry white text at 4.5:1; purple text on black uses the lighter shade', () => {
    const signal = rebrandCss.match(/--aid-signal:\s*(#[0-9a-f]{6})/i)![1]
    const strong = rebrandCss.match(/--aid-signal-strong:\s*(#[0-9a-f]{6})/i)![1]
    expect(contrast('#ffffff', signal)).toBeGreaterThanOrEqual(4.5)
    for (const bg of SURFACES) expect(contrast(strong, bg)).toBeGreaterThanOrEqual(4.5)
    expect(rebrandCss).not.toMatch(/[^-]color:\s*var\(--aid-signal\)/)
    // Red fills (cancel, Call 911) with white text.
    for (const red of ['#c8383d']) expect(contrast('#ffffff', red)).toBeGreaterThanOrEqual(4.5)
  })

  it('no low-contrast Tailwind greys on the dark app', () => {
    const hits = Object.entries(tsx).filter(([, text]) => /\btext-gray-(500|600|700)\b|\btext-white\/(10|20|30|40|50)\b/.test(text)).map(([file]) => file)
    expect(hits).toEqual([])
  })

  it('admin (light) text colours are 4.5:1 on white', () => {
    const vars = Object.fromEntries([...adminCss.matchAll(/--([a-z-0-9]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]))
    for (const name of ['text', 'muted', 'faint', 'accent', 'ok', 'warn', 'danger']) expect(contrast(vars[name], '#ffffff'), name).toBeGreaterThanOrEqual(4.5)
    expect(contrast(vars['ink-muted'], vars.ink), 'sidebar muted').toBeGreaterThanOrEqual(4.5)
  })
})

describe('reduced motion (F4)', () => {
  it('CSS animations stop and framer-motion follows the system setting', () => {
    expect(indexCss).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration: 0\.01ms !important/)
    expect(rebrandCss).toMatch(/prefers-reduced-motion: reduce\) \{ \.track-car__pulse \{ animation: none/)
    expect(mainTsx).toMatch(/<MotionConfig reducedMotion="user">/)
  })
})
