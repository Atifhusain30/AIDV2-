/**
 * The request flow stepper (design system): Location → Details → Driver → Complete. Done steps
 * show a violet check, the current step a violet ring, later steps a grey ring. Screen readers hear
 * each step with its state and the current one is aria-current="step".
 */

import { Check } from 'lucide-react'

export const REQUEST_STEPS = ['Location', 'Details', 'Driver', 'Complete'] as const

export default function FlowStepper({ current, steps = REQUEST_STEPS, label = 'Request steps' }: {
  /** 0-based index of the step the person is on. */
  current: number
  steps?: readonly string[]
  label?: string
}) {
  return (
    <ol className="ui-stepper" aria-label={label}>
      {steps.map((step, index) => {
        const state = index < current ? 'is-done' : index === current ? 'is-current' : ''
        return (
          <li key={step} className={state} aria-current={index === current ? 'step' : undefined}>
            <span className="ui-stepper__dot" aria-hidden="true">{index < current && <Check size={14} strokeWidth={3} />}</span>
            <span className="ui-stepper__label">{step}</span>
            {index < current && <span className="sr-only"> (done)</span>}
          </li>
        )
      })}
    </ol>
  )
}
