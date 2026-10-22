/** Status pill (design system): green = done, red = cancelled/problem, amber = attention, violet = live. */

import type { ReactNode } from 'react'

export type PillTone = 'success' | 'danger' | 'warning' | 'brand' | 'neutral'

export default function StatusPill({ tone = 'neutral', children }: { tone?: PillTone; children: ReactNode }) {
  return <span className={`ui-pill ui-pill--${tone}`}>{children}</span>
}
