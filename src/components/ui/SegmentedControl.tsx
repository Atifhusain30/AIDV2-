/**
 * Segmented control (design system), e.g. Yes / No. A radio group: arrow keys move between options,
 * the chosen one is filled violet. `value` may be null (nothing answered yet).
 */

import { useRef, type KeyboardEvent } from 'react'

export interface SegmentOption<T extends string> { value: T; label: string }

export default function SegmentedControl<T extends string>({ label, labelledBy, value, options, onChange, className = '' }: {
  label?: string
  labelledBy?: string
  value: T | null
  options: SegmentOption<T>[]
  onChange: (value: T) => void
  className?: string
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = options.findIndex((option) => option.value === value)

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = (index + step + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div className={`ui-segment ${className}`.trim()} role="radiogroup" aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy}>
      {options.map((option, index) => {
        const checked = option.value === value
        // Roving tab stop: the chosen option, or the first one when nothing is chosen yet.
        const tabbable = checked || (selectedIndex === -1 && index === 0)
        return (
          <button key={option.value} ref={(node) => { refs.current[index] = node }} type="button" role="radio" aria-checked={checked}
            tabIndex={tabbable ? 0 : -1} className={checked ? 'is-checked' : ''}
            onClick={() => onChange(option.value)} onKeyDown={(event) => onKeyDown(event, index)}>
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
