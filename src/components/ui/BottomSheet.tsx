/**
 * The app's one bottom-sheet look (F1/F2), built on the shared accessible Dialog (F4):
 * grab handle, title (+ optional subtitle), close button, scrollable body and an optional
 * footer that stays pinned to the bottom of the sheet (the primary action lives there).
 */

import { useId, type ReactNode } from 'react'
import { X } from 'lucide-react'
import Dialog from './Dialog'

export interface BottomSheetProps {
  title: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  /** false while saving or when a choice is required. */
  dismissible?: boolean
  role?: 'dialog' | 'alertdialog'
  /** id for the title (when other code needs to focus it); generated otherwise. */
  titleId?: string
  /** id of the element describing the sheet (defaults to the subtitle). */
  describedBy?: string
  closeLabel?: string
  /** Hide the × (confirm steps that must be answered with their own buttons). */
  showClose?: boolean
  footer?: ReactNode
  /** Extra panel class (e.g. sizing). */
  className?: string
  children?: ReactNode
}

export default function BottomSheet({
  title, subtitle, onClose, dismissible = true, role, titleId, describedBy, closeLabel = 'Close', showClose = true, footer, className = '', children,
}: BottomSheetProps) {
  const generated = useId()
  const headingId = titleId ?? `sheet-${generated}`
  const subtitleId = `${headingId}-subtitle`
  return (
    <Dialog labelledBy={headingId} describedBy={describedBy ?? (subtitle ? subtitleId : undefined)} role={role}
      className={`account-sheet ui-sheet ${className}`.trim()} dismissible={dismissible} onClose={onClose}>
      <header className="ui-sheet__header">
        <div>
          <h2 id={headingId} tabIndex={-1}>{title}</h2>
          {subtitle && <p id={subtitleId}>{subtitle}</p>}
        </div>
        {showClose && (
          <button type="button" className="ui-sheet__close" aria-label={closeLabel} disabled={!dismissible} onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        )}
      </header>
      {children !== undefined && <div className="ui-sheet__body">{children}</div>}
      {footer && <div className="ui-sheet__footer">{footer}</div>}
    </Dialog>
  )
}
