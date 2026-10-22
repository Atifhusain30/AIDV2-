/**
 * The one accessible dialog / bottom sheet for the app (F4).
 *
 * Every modal and sheet uses this so they all behave the same for keyboard, switch-control and
 * screen-reader users:
 * - role="dialog" (or "alertdialog"), aria-modal, named by its title (aria-labelledby)
 * - focus moves into the dialog when it opens (the dialog itself, so its title is read first,
 *   or an element marked data-autofocus / passed as initialFocus)
 * - Tab and Shift+Tab stay inside the dialog
 * - Escape and a tap on the backdrop close it — unless `dismissible` is false (e.g. while saving)
 * - everything behind it is `inert` (not focusable, not read by VoiceOver/TalkBack)
 * - focus returns to the button that opened it when it closes
 * - nested dialogs (e.g. a confirm inside chat) work: only the top one reacts to keys
 */

import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE = [
  'a[href]', 'area[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', 'iframe', 'audio[controls]', 'video[controls]',
  '[contenteditable="true"]', '[tabindex]:not([tabindex="-1"])',
].join(',')

/** Focusable elements inside `root`, in tab order, skipping hidden and inert parts. */
export function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if (el.closest('[inert],[hidden],[aria-hidden="true"]')) return false
    // Unchecked radios in a group are reached with the arrow keys, not Tab.
    if (el instanceof HTMLInputElement && el.type === 'radio' && !el.checked && el.name) {
      const group = root.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(el.name)}"]`)
      if (Array.from(group).some((other) => other.checked)) return false
    }
    return true
  })
}

/** Open dialogs, bottom-most first. Only the last one handles keys and focus. */
const stack: HTMLElement[] = []

/** Make everything outside `keep` inert; returns the elements changed so they can be restored. */
function inertOutside(keep: HTMLElement): HTMLElement[] {
  const changed: HTMLElement[] = []
  let node: HTMLElement | null = keep
  while (node && node !== document.body && node.parentElement) {
    for (const sibling of Array.from(node.parentElement.children)) {
      if (sibling === node || !(sibling instanceof HTMLElement)) continue
      if (['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE'].includes(sibling.tagName)) continue
      // Live regions stay audible (e.g. the app-wide announcer).
      if (sibling.hasAttribute('data-live-region')) continue
      if (sibling.hasAttribute('inert')) continue
      sibling.setAttribute('inert', '')
      changed.push(sibling)
    }
    node = node.parentElement
  }
  return changed
}

export interface DialogOptions {
  onClose: () => void
  /** false while a save is in flight or a choice is required: Escape / backdrop do nothing. */
  dismissible?: boolean
  /** Element to focus first; otherwise the first [data-autofocus], otherwise the dialog itself. */
  initialFocus?: RefObject<HTMLElement | null>
}

/**
 * Focus management for a dialog panel. `container` is the outermost element of the dialog
 * (backdrop) — everything outside it becomes inert. Use <Dialog> unless the panel needs its
 * own markup (e.g. a framer-motion animated sheet).
 */
export function useDialog(panel: RefObject<HTMLElement | null>, container: RefObject<HTMLElement | null>, { onClose, dismissible = true, initialFocus }: DialogOptions) {
  const latest = useRef({ onClose, dismissible })
  latest.current = { onClose, dismissible }

  useLayoutEffect(() => {
    const el = panel.current
    const outer = container.current ?? el
    if (!el || !outer) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    stack.push(el)
    const madeInert = inertOutside(outer)

    const first = initialFocus?.current ?? el.querySelector<HTMLElement>('[data-autofocus]') ?? el
    if (first === el && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
    first.focus({ preventScroll: true })

    const isTop = () => stack[stack.length - 1] === el
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTop()) return
      if (event.key === 'Escape') {
        event.stopPropagation()
        event.preventDefault()
        if (latest.current.dismissible) latest.current.onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusableWithin(el)
      if (items.length === 0) { event.preventDefault(); el.focus(); return }
      const active = document.activeElement as HTMLElement | null
      const index = active ? items.indexOf(active) : -1
      if (event.shiftKey && (index <= 0)) { event.preventDefault(); items[items.length - 1].focus() }
      else if (!event.shiftKey && (index === -1 || index === items.length - 1)) { event.preventDefault(); items[0].focus() }
    }
    // Focus that escapes (e.g. a screen-reader swipe out of the dialog) is brought back.
    const onFocusIn = (event: FocusEvent) => {
      if (!isTop()) return
      const target = event.target as Node | null
      if (target && !el.contains(target)) el.focus({ preventScroll: true })
    }
    window.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('focusin', onFocusIn)

    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('focusin', onFocusIn)
      const at = stack.lastIndexOf(el)
      if (at >= 0) stack.splice(at, 1)
      madeInert.forEach((node) => node.removeAttribute('inert'))
      // Return focus to whatever opened the dialog, if it's still on screen.
      if (opener && opener.isConnected && !opener.closest('[inert]')) opener.focus({ preventScroll: true })
      // The opener is gone (e.g. a menu item): keep focus in the dialog underneath, if any.
      else if (stack.length) stack[stack.length - 1].focus({ preventScroll: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- set up once per open
  }, [])
}

export interface DialogProps extends DialogOptions {
  /** id of the visible title element. */
  labelledBy: string
  describedBy?: string
  /** 'alertdialog' for confirmations that interrupt (cancel, 911). */
  role?: 'dialog' | 'alertdialog'
  /** Panel classes; defaults to the app's bottom sheet. */
  className?: string
  backdropClassName?: string
  /** The grab handle on bottom sheets. */
  handle?: boolean
  /** Render into document.body (default) so the sheet sits above the bottom nav. */
  portal?: boolean
  children: ReactNode
}

export default function Dialog({
  labelledBy, describedBy, role = 'dialog', className = 'account-sheet', backdropClassName = 'account-sheet-backdrop',
  handle = true, portal = true, children, ...options
}: DialogProps) {
  const panel = useRef<HTMLElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  useDialog(panel, backdrop, options)
  const { onClose, dismissible = true } = options

  // Close on a tap that starts and ends on the backdrop (not a drag out of a text field).
  const downOnBackdrop = useRef(false)
  useEffect(() => () => { downOnBackdrop.current = false }, [])

  const node = (
    <div
      ref={backdrop}
      className={backdropClassName}
      role="presentation"
      onMouseDown={(event) => { downOnBackdrop.current = event.target === event.currentTarget }}
      onClick={(event) => { if (downOnBackdrop.current && event.target === event.currentTarget && dismissible) onClose(); downOnBackdrop.current = false }}
    >
      <section ref={panel} className={className} role={role} aria-modal="true" aria-labelledby={labelledBy} aria-describedby={describedBy} tabIndex={-1}>
        {handle && <div className="account-sheet__handle" aria-hidden="true" />}
        {children}
      </section>
    </div>
  )
  return portal ? createPortal(node, document.body) : node
}
