/**
 * Driver card (design system): initials avatar (AID has no profile photos), name, ★ rating (count)
 * only once the server has enough ratings (B15 — otherwise "New on AID"), and what they drive with
 * a plate badge. `actions` sits top-right (e.g. the Message button).
 */

import type { ReactNode } from 'react'
import { Car, Star } from 'lucide-react'
import PersonAvatar from './PersonAvatar'
import { jobCountLabel, ratingSummary } from '../../lib/ratings'

export default function DriverCard({ name, rating, totalJobs, vehicle, plate, actions, label = 'Your driver', children }: {
  name: string
  rating?: { rating?: number | null; ratingCount?: number } | null
  totalJobs?: number
  vehicle?: string | null
  plate?: string | null
  actions?: ReactNode
  label?: string
  children?: ReactNode
}) {
  const summary = ratingSummary(rating)
  const jobs = jobCountLabel(totalJobs)
  return (
    <div className="ui-driver" role="group" aria-label={label}>
      <div className="ui-driver__person">
        <PersonAvatar name={name} />
        <div className="ui-driver__text">
          <strong>{name}</strong>
          <span className="ui-meta">
            {summary
              ? <><span className="ui-rating" aria-label={summary.label}><Star size={13} aria-hidden="true" /> {summary.value} ({summary.count})</span>{jobs && <> · {jobs}</>}</>
              : <span>New on AID{jobs && <> · {jobs}</>}</span>}
          </span>
        </div>
        {actions && <div className="ui-driver__actions">{actions}</div>}
      </div>
      {vehicle !== undefined && (
        <div className="ui-driver__vehicle">
          <span className="ui-vehicle__icon ui-vehicle__icon--sm" aria-hidden="true"><Car size={18} /></span>
          <strong>{vehicle || 'Vehicle details not added yet'}</strong>
          {plate && <span className="ui-plate">{plate}</span>}
        </div>
      )}
      {children}
    </div>
  )
}
