/**
 * Visually hidden polite live region (F4). Kept mounted so screen readers notice text changes.
 * No role, so it never competes with a screen's visible role="status" chip.
 */
export default function LiveRegion({ message }: { message: string }) {
  return <div className="sr-only" aria-live="polite" aria-atomic="true" data-live-region="">{message}</div>
}
