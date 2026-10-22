/** Section title with an optional text action on the right (design system). Sentence case, no eyebrow. */

import type { ReactNode } from 'react'

export default function SectionHeader({ id, title, action, children }: {
  id?: string
  title: ReactNode
  action?: { label: string; onClick: () => void; ariaLabel?: string }
  children?: ReactNode
}) {
  return (
    <div className="ui-section-header">
      <h2 id={id}>{title}</h2>
      {action && <button type="button" onClick={action.onClick} aria-label={action.ariaLabel}>{action.label}</button>}
      {children}
    </div>
  )
}
