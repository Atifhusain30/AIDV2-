/**
 * Customer Activity: the live request (if any) on top, then past services grouped by month with
 * simple status filters. Completed services offer Receipt and Request again. F5: skeleton on first
 * load, an error with Try again, the saved list with a "couldn't refresh" note when the server
 * can't be reached, and honest empty states.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { ArrowRight, Clock3, Plus, ReceiptText, RotateCcw, RotateCw, Wrench } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import type { Booking } from '../types'
import { formatPrice } from '../lib/money'
import { loadBookingHistory, useHistoryLoad } from '../lib/bookingHistory'
import { dayLabel, monthLabel, serviceIcon, statusLabels, statusTone, timeLabel } from '../lib/serviceDisplay'
import Button from '../components/ui/Button'
import { SkeletonRows } from '../components/ui/Skeleton'
import { EmptyState, ErrorState } from '../components/ui/States'

type Filter = 'all' | 'completed' | 'cancelled'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
]

function ActivityItem({ booking }: { booking: Booking }) {
  const { openBookingDetail, openReceipt, rebookFromHistory } = useAppStore()
  const Icon = serviceIcon(booking.service.id)
  const completed = booking.status === 'completed'
  // Completed is the normal case: no chip. Cancelled / no driver / live get one.
  const tone = completed ? null : statusTone(booking.status)

  return (
    <li className="activity-item">
      <button type="button" className="activity-item__main" onClick={() => openBookingDetail(booking.id)}>
        <span className="activity-item__icon" aria-hidden="true"><Icon size={20} /></span>
        <span className="activity-item__text">
          <span className="activity-item__title">
            <strong>{booking.service.name}</strong>
            <span className={`activity-item__price${tone === 'danger' ? ' is-muted' : ''}`}>{formatPrice(booking.finalPrice ?? booking.estimatedPrice)}</span>
          </span>
          <small>{dayLabel(booking.createdAt)} · {timeLabel(booking.createdAt)}</small>
          <small className="activity-item__where">{booking.location.address}</small>
          {tone && <span className={`ui-chip ui-chip--${tone} activity-item__status`}>{statusLabels[booking.status]}</span>}
        </span>
      </button>
      {completed && (
        <div className="activity-item__actions">
          <Button size="sm" variant="secondary" icon={<ReceiptText size={16} aria-hidden="true" />} onClick={() => openReceipt(booking.id)}>Receipt</Button>
          <Button size="sm" variant="secondary" icon={<RotateCcw size={16} aria-hidden="true" />} onClick={() => rebookFromHistory(booking.id)}>Request again</Button>
        </div>
      )}
    </li>
  )
}

export default function HistoryScreen() {
  const { activeBooking, bookingHistory, setCurrentScreen } = useAppStore()
  const { status, error } = useHistoryLoad()
  const [filter, setFilter] = useState<Filter>('all')
  const [retrying, setRetrying] = useState(false)

  const retry = async () => {
    setRetrying(true)
    await loadBookingHistory()
    setRetrying(false)
  }

  // Past services, newest first, grouped by month. The live request is shown on its own above.
  const past = useMemo(() => bookingHistory
    .filter((booking) => booking.id !== activeBooking?.id)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)), [bookingHistory, activeBooking?.id])
  const groups = useMemo(() => {
    // Expired requests (no driver found) are listed with the cancelled ones.
    const shown = filter === 'all' ? past : past.filter((booking) => booking.status === filter || (filter === 'cancelled' && booking.status === 'expired'))
    const byMonth: { month: string; items: Booking[] }[] = []
    for (const booking of shown) {
      const month = monthLabel(booking.createdAt)
      const last = byMonth[byMonth.length - 1]
      if (last && last.month === month) last.items.push(booking)
      else byMonth.push({ month, items: [booking] })
    }
    return byMonth
  }, [past, filter])

  const hasPast = past.length > 0
  let body: ReactNode
  if (!hasPast && status === 'loading') {
    body = <SkeletonRows count={4} card label="Loading your activity" />
  } else if (!hasPast && status === 'error') {
    body = <ErrorState title="Couldn't load your activity" body={error} onRetry={() => void retry()} retrying={retrying} />
  } else if (!hasPast) {
    body = (
      <EmptyState
        icon={<Wrench size={22} />}
        title={activeBooking ? 'No past services yet' : 'No roadside activity yet'}
        body="Finished and cancelled requests show up here, with receipts."
        action={activeBooking ? undefined : { label: 'Request roadside help', icon: <Plus size={16} aria-hidden="true" />, onClick: () => setCurrentScreen('home') }}
      />
    )
  } else if (groups.length === 0) {
    body = <EmptyState compact icon={<Clock3 size={22} />} title={`No ${filter} services`} body="Choose All to see everything." />
  } else {
    body = groups.map((group) => (
      <section className="activity-group" key={group.month} aria-label={group.month}>
        <h2 className="activity-group__title">{group.month}</h2>
        <ul className="activity-items">
          {group.items.map((booking) => <ActivityItem key={booking.id} booking={booking} />)}
        </ul>
      </section>
    ))
  }

  return (
    <div className="ui-screen activity-screen">
      <header className="ui-screen-title"><h1>Activity</h1></header>

      {activeBooking && (
        <button type="button" className="consumer-live activity-live" onClick={() => setCurrentScreen('chat')}>
          <span className="consumer-live__top"><span className="consumer-live__status"><span className="ui-live-dot" aria-hidden="true" /> {statusLabels[activeBooking.status]}</span></span>
          <span className="consumer-live__title">{activeBooking.service.name}</span>
          <span className="consumer-live__meta">{activeBooking.location.address}</span>
          <span className="consumer-live__cta">Track <ArrowRight size={18} aria-hidden="true" /></span>
        </button>
      )}

      {hasPast && status === 'error' && (
        <div className="ui-alert ui-alert--warning activity-stale" role="status">
          <span>Couldn't refresh. Showing what's saved on this phone.</span>
          <button type="button" onClick={() => void retry()} disabled={retrying}><RotateCw size={15} aria-hidden="true" /> {retrying ? 'Trying…' : 'Try again'}</button>
        </div>
      )}

      {hasPast && (
        <div className="ui-segmented" role="group" aria-label="Filter activity">
          {FILTERS.map((item) => (
            <button type="button" key={item.id} aria-pressed={filter === item.id} className={filter === item.id ? 'is-active' : ''} onClick={() => setFilter(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      )}

      <div className="activity-body">{body}</div>
    </div>
  )
}
