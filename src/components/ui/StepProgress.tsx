/**
 * Compact job progress (design system): the current step's name and a thin segmented bar —
 * replaces the cramped five-circle row. Screen readers get "Step 2 of 5: On the way".
 */

export interface Step { id: string; label: string }

export default function StepProgress({ steps, current, label = 'Progress' }: { steps: Step[]; current: number; label?: string }) {
  const index = Math.max(0, Math.min(current, steps.length - 1))
  const step = steps[index]
  return (
    <div className="ui-progress" role="group" aria-label={label}>
      <p className="ui-progress__text"><strong>{step?.label}</strong><span> · Step {index + 1} of {steps.length}</span></p>
      <ol className="ui-progress__bar" aria-hidden="true">
        {steps.map((item, i) => <li key={item.id} className={i < index ? 'is-done' : i === index ? 'is-current' : ''} />)}
      </ol>
    </div>
  )
}
