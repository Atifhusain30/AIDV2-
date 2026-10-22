/**
 * Admin building blocks (F2/F5): table-shaped loading placeholders, an error with Try again and an
 * honest empty state — the same three states as the apps, sized for a dense desktop console.
 */

import type { ReactNode } from 'react'
import { AlertCircle, RotateCw } from 'lucide-react'

/** Placeholder rows shaped like the table that is loading (never fake names or numbers). */
export function SkeletonTable({ rows = 6, cols = 5, label }: { rows?: number; cols?: number; label: string }) {
  return (
    <div className="skeleton-table" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, row) => (
        <div className="skeleton-table__row" key={row} aria-hidden="true">
          <span className="skeleton skeleton--avatar" />
          <span className="skeleton-table__lines">
            <span className="skeleton" style={{ width: `${46 - (row % 3) * 8}%` }} />
            <span className="skeleton skeleton--sm" style={{ width: `${30 + (row % 4) * 6}%` }} />
          </span>
          {Array.from({ length: Math.max(0, cols - 2) }, (_, col) => <span className="skeleton skeleton--cell" key={col} />)}
        </div>
      ))}
    </div>
  )
}

/** A detail page loading: header and two panels. */
export function SkeletonDetail({ label }: { label: string }) {
  return (
    <div className="skeleton-detail" role="status" aria-label={label}>
      <div className="skeleton-detail__head" aria-hidden="true">
        <span className="skeleton skeleton--avatar-lg" />
        <span className="skeleton-table__lines"><span className="skeleton" style={{ width: 240 }} /><span className="skeleton skeleton--sm" style={{ width: 360 }} /></span>
      </div>
      <div className="review" aria-hidden="true">
        <div className="skeleton skeleton--panel" />
        <div className="skeleton skeleton--panel skeleton--panel-sm" />
      </div>
    </div>
  )
}

export function LoadError({ title, message, onRetry, retrying = false }: { title: string; message: string; onRetry: () => void; retrying?: boolean }) {
  return (
    <div className="load-error" role="alert">
      <span className="load-error__icon" aria-hidden="true"><AlertCircle size={20} /></span>
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      <button type="button" className="btn btn--secondary" onClick={onRetry} disabled={retrying}>
        <RotateCw size={15} className={retrying ? 'spin' : undefined} aria-hidden="true" />Try again
      </button>
    </div>
  )
}

export function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon" aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <span className="muted">{body}</span>
    </div>
  )
}
