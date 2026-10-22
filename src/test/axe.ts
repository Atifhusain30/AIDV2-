/**
 * F4: run axe-core against rendered UI in tests. jsdom has no layout or colours, so colour
 * contrast and target size are checked in a real browser (see scripts/a11y-browser-audit.js)
 * and by the CSS audit in src/a11y.css.test.ts; everything else (names, roles, ARIA, labels,
 * landmarks inside the rendered tree) is checked here.
 */
import axe from 'axe-core'

export interface AxeFinding { id: string; impact: string | null | undefined; targets: string[]; help: string }

/** axe violations with impact "serious" or "critical" in `root` (default: the whole document). */
export async function seriousA11yViolations(root: Element | Document = document): Promise<AxeFinding[]> {
  const result = await axe.run(root as Element, {
    resultTypes: ['violations'],
    rules: {
      // Needs real rendering — covered by the browser audit.
      'color-contrast': { enabled: false },
      'target-size': { enabled: false },
    },
  })
  return result.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => ({ id: violation.id, impact: violation.impact, help: violation.help, targets: violation.nodes.map((node) => node.target.join(' ')) }))
}
