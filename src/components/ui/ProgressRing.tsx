/**
 * Circular progress ring (design system): a thin violet arc on a grey track, with content in the
 * middle (an icon, a step name). Flat — no glow. The arc's growth is a CSS transition that Reduce
 * Motion switches off. `value` is 0–1 and must come from real job state.
 */

import type { ReactNode } from 'react'

export default function ProgressRing({ value, label, size = 168, stroke = 8, children }: {
  value: number
  label: string
  size?: number
  stroke?: number
  children?: ReactNode
}) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  return (
    <div className="ui-ring" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamped * 100)}
      style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
        <circle className="ui-ring__track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" />
        <circle className="ui-ring__value" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - clamped)} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="ui-ring__center">{children}</div>
    </div>
  )
}
