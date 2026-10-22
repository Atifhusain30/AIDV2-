/**
 * The bottom action area (design system): one dominant action in the thumb zone, pinned to the
 * bottom of the screen while the content scrolls, above the home indicator (safe area). It sits
 * in the page flow (position: sticky), so it never hides the last part of the content.
 */

import type { ReactNode } from 'react'

export default function StickyActionBar({ children, hint, label }: { children: ReactNode; hint?: ReactNode; label?: string }) {
  return (
    <div className="ui-actionbar" role={label ? 'group' : undefined} aria-label={label}>
      {children}
      {hint && <p className="ui-actionbar__hint">{hint}</p>}
    </div>
  )
}
