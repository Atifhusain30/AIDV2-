/**
 * F4: filter tabs for the admin lists, following the ARIA tabs pattern — one tab in the Tab order
 * (the selected one), arrow keys / Home / End move between tabs and select, and each tab controls
 * the list panel below (role="tabpanel", labelled by the selected tab).
 */
import { useRef, type KeyboardEvent, type ReactNode } from 'react'

export interface FilterTab<T extends string> { id: T; label: string }

export const tabId = (panelId: string, id: string) => `${panelId}-tab-${id}`

export default function FilterTabs<T extends string>({ label, tabs, value, onChange, panelId, count }: {
  label: string
  tabs: FilterTab<T>[]
  value: T
  onChange: (id: T) => void
  /** id of the element showing the filtered list. */
  panelId: string
  count?: (id: T) => ReactNode
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1
    const next = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[event.key]
    if (next === undefined) return
    event.preventDefault()
    onChange(tabs[next].id)
    refs.current[next]?.focus()
  }
  return (
    <div role="tablist" aria-label={label} className="tabs">
      {tabs.map((item, index) => (
        <button
          key={item.id}
          ref={(element) => { refs.current[index] = element }}
          id={tabId(panelId, item.id)}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          aria-controls={panelId}
          tabIndex={value === item.id ? 0 : -1}
          className="tab"
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {item.label}{count?.(item.id)}
        </button>
      ))}
    </div>
  )
}
