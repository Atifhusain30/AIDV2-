/** Format a YYYY-MM-DD calendar date (no timezone shift), e.g. "Jun 30, 2098". */
export function formatCalendarDate(isoDate: string): string {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}
