/**
 * Person avatar (design system). AID has no profile photos, so this shows the person's initials
 * (first + last) on a neutral tile — no brand colour, no invented picture. The initials are drawn
 * by CSS from data-initials: decoration only, so a button's spoken name stays its real label.
 */

export function initials(name?: string | null, fallback = '') {
  const parts = (name || '').replace(/[^\p{L}\s'-]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return fallback
  const first = parts[0].charAt(0)
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : ''
  return (first + last).toUpperCase()
}

export default function PersonAvatar({ name, size = 'md' }: { name?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const text = initials(name)
  return (
    <span className={`ui-avatar ui-avatar--${size}`} data-initials={text || undefined} aria-hidden="true">
      {!text && <svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" strokeLinecap="round" /></svg>}
    </span>
  )
}
