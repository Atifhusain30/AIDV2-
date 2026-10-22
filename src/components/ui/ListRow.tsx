/**
 * Grouped list + row (design system). One row style for menus, settings, details and "more
 * options": leading icon tile, title, optional subtitle, trailing value or chevron.
 */

import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

type Tone = 'default' | 'danger' | 'brand'

interface RowContent {
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  /** Right side: a value, chip or custom node. Buttons get a chevron when nothing is given. */
  trailing?: ReactNode
  tone?: Tone
}

interface ButtonRowProps extends RowContent {
  onClick: () => void
  disabled?: boolean
  ariaLabel?: string
  hasPopup?: boolean
  chevron?: boolean
  className?: string
}

const toneClass = (tone: Tone = 'default') => (tone === 'default' ? '' : ` ui-row--${tone}`)

function Inner({ icon, title, subtitle, trailing }: RowContent) {
  return (
    <>
      {icon && <span className="ui-row__icon" aria-hidden="true">{icon}</span>}
      <span className="ui-row__text">
        <strong>{title}</strong>
        {subtitle && <small>{subtitle}</small>}
      </span>
      {trailing}
    </>
  )
}

/** A tappable row. */
export function ListRow({ onClick, disabled, ariaLabel, hasPopup, chevron = true, className = '', ...content }: ButtonRowProps) {
  return (
    <button type="button" className={`ui-row${toneClass(content.tone)} ${className}`.trim()} onClick={onClick} disabled={disabled}
      aria-label={ariaLabel} aria-haspopup={hasPopup ? 'dialog' : undefined}>
      <Inner {...content} />
      {content.trailing === undefined && chevron && <ChevronRight className="ui-row__chevron" size={18} aria-hidden="true" />}
    </button>
  )
}

/** A read-only row (label / value). */
export function InfoRow({ className = '', ...content }: RowContent & { className?: string }) {
  return <div className={`ui-row ui-row--static${toneClass(content.tone)} ${className}`.trim()}><Inner {...content} /></div>
}

/** The grouped container: one card, rows separated by hairlines. */
export function List({ children, label, className = '' }: { children: ReactNode; label?: string; className?: string }) {
  return <div className={`ui-list ${className}`.trim()} role={label ? 'group' : undefined} aria-label={label}>{children}</div>
}
