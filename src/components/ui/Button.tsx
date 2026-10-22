/**
 * The app's one button (design system, F2). Variants:
 * - primary: the single dominant action on a screen or sheet (violet fill)
 * - secondary: neutral surface, for the alternative action
 * - ghost: text-only, for low-emphasis actions
 * - destructive: solid red, only inside a confirm step (cancel job, delete account)
 * - danger: quiet red outline, for the entry point to a destructive flow
 * Every size is at least 44 px tall (F4).
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'danger'
export type ButtonSize = 'md' | 'lg' | 'sm'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  /** Shows a spinner and disables the button; `loadingLabel` replaces the text while busy. */
  loading?: boolean
  loadingLabel?: string
  icon?: ReactNode
}

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', block = false, extra = '') {
  return ['ui-btn', `ui-btn--${variant}`, size !== 'md' ? `ui-btn--${size}` : '', block ? 'ui-btn--block' : '', extra].filter(Boolean).join(' ')
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', block = false, loading = false, loadingLabel, icon, className = '', children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, block, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : icon}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  )
})

export default Button
