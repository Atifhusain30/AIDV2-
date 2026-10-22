/**
 * Loading placeholders (F5). Shapes only — never fake names, prices or counts. The wrapper is a
 * polite status so screen readers hear "Loading …" once instead of a silent screen.
 */

import type { CSSProperties } from 'react'

export function Skeleton({ width, height = 14, radius, className = '' }: { width?: number | string; height?: number | string; radius?: number | string; className?: string }) {
  const style: CSSProperties = { width, height, borderRadius: radius }
  return <span className={`ui-skeleton ${className}`.trim()} style={style} aria-hidden="true" />
}

/** A list of row-shaped placeholders (icon tile + two lines), matching ListRow / activity cards. */
export function SkeletonRows({ count = 3, label = 'Loading', card = false }: { count?: number; label?: string; card?: boolean }) {
  return (
    <div className={card ? 'ui-skeleton-cards' : 'ui-list ui-skeleton-list'} role="status" aria-label={label}>
      {Array.from({ length: count }, (_, index) => (
        <div className="ui-skeleton-row" key={index}>
          <Skeleton width={40} height={40} radius={12} />
          <span className="ui-skeleton-row__lines">
            <Skeleton width={`${62 - index * 9}%`} height={13} />
            <Skeleton width={`${40 + index * 7}%`} height={11} />
          </span>
        </div>
      ))}
    </div>
  )
}
