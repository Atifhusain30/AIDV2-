/**
 * Honest empty and error states (F5). Empty: says what will appear here and offers the one next
 * step. Error: says it plainly (role="alert") and always offers Try again.
 */

import type { ReactNode } from 'react'
import { AlertCircle, RotateCw } from 'lucide-react'
import Button from './Button'

export function EmptyState({ icon, title, body, action, compact = false, headingLevel = 2 }: {
  icon?: ReactNode
  title: string
  body?: ReactNode
  action?: { label: string; onClick: () => void; icon?: ReactNode }
  compact?: boolean
  headingLevel?: 2 | 3
}) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2'
  return (
    <div className={`ui-empty${compact ? ' ui-empty--compact' : ''}`}>
      {icon && <span className="ui-empty__icon" aria-hidden="true">{icon}</span>}
      <Heading>{title}</Heading>
      {body && <p>{body}</p>}
      {action && <Button size="sm" variant="secondary" icon={action.icon} onClick={action.onClick}>{action.label}</Button>}
    </div>
  )
}

export function ErrorState({ title = 'Something went wrong', body, onRetry, retrying = false, compact = false }: {
  title?: string
  body?: ReactNode
  onRetry?: () => void
  retrying?: boolean
  compact?: boolean
}) {
  return (
    <div className={`ui-empty ui-empty--error${compact ? ' ui-empty--compact' : ''}`} role="alert">
      <span className="ui-empty__icon" aria-hidden="true"><AlertCircle size={22} /></span>
      <h2>{title}</h2>
      {body && <p>{body}</p>}
      {onRetry && (
        <Button size="sm" variant="secondary" icon={<RotateCw size={16} aria-hidden="true" />} loading={retrying} loadingLabel="Trying again…" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
