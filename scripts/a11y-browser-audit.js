/**
 * F4 browser accessibility audit — paste into the DevTools console (or run with Playwright's
 * page.evaluate) on any screen of the app or admin site, at phone width (390 × 844).
 * Needs axe-core on the page: window.axe (e.g. load node_modules/axe-core/axe.min.js first).
 *
 * Reports:
 *  - axe violations (all impacts, including colour contrast, which jsdom tests can't check)
 *  - touch targets smaller than 44 × 44 px (buttons, links, inputs, radios via their label)
 *
 * Usage: await a11yAudit()  →  { violations: [...], smallTargets: [...] }
 */
/* eslint-disable no-undef */
window.a11yAudit = async function a11yAudit({ minTarget = 44 } = {}) {
  const result = await window.axe.run(document, { resultTypes: ['violations'] })
  const violations = result.violations.map((v) => ({ id: v.id, impact: v.impact, count: v.nodes.length, targets: v.nodes.map((n) => n.target.join(' ')) }))
  const selector = 'a[href],button,input,select,textarea,[role=button],[role=radio],[role=tab],[role=switch],[role=menuitem],[tabindex]:not([tabindex="-1"])'
  const smallTargets = []
  document.querySelectorAll(selector).forEach((el) => {
    if (el.closest('[inert],[aria-hidden="true"]')) return
    const own = el.getBoundingClientRect()
    if (own.width === 0 && own.height === 0) return
    // Native radios/checkboxes are tapped through their label card.
    const target = (el.type === 'radio' || el.type === 'checkbox') ? el.closest('label') || el : el
    const box = target.getBoundingClientRect()
    if (box.width < minTarget || box.height < minTarget) {
      smallTargets.push(`${(el.getAttribute('aria-label') || el.textContent || el.className || el.tagName).toString().trim().slice(0, 40)} — ${Math.round(box.width)}×${Math.round(box.height)}`)
    }
  })
  return { violations, smallTargets }
}
