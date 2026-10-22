/**
 * Uber-style tracking layout (customer): a full-bleed live map at the top and a bottom sheet that
 * rises over it as you scroll or tap its handle. The map stays put (position: sticky) while the
 * sheet scrolls, so nothing is hidden: the whole sheet is always reachable, above the home
 * indicator, and the tab bar is hidden while a request is live (Back to Home is top-left).
 */

import { useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, Flag, MapPin, ShieldCheck } from 'lucide-react'
import { Skeleton } from '../ui/Skeleton'
import ChunkBoundary from '../ui/ChunkBoundary'
import { lazyWithRetry } from '../../lib/lazyWithRetry'

const LiveDriverMap = lazyWithRetry(() => import('./LiveDriverMap'))

type Point = { lat: number; lng: number }

export function TrackLayout({ label, pickup, driver, stale = false, showConnector = false, mapSummary, chip, onBack, onSafety, overlay, children }: {
  label: string
  pickup: Point
  driver: Point | null
  stale?: boolean
  showConnector?: boolean
  /** Text alternative for the map (F4). */
  mapSummary: string
  /** Status chip over the map (role="status" lives inside). */
  chip?: ReactNode
  onBack?: () => void
  /** Shield button top-right on the map: Safety tips and Call 911 (behind its confirm step). */
  onSafety?: () => void
  /** Decorative layer over the map (ETA chip, searching ring). Hidden from screen readers. */
  overlay?: ReactNode
  children: ReactNode
}) {
  const hasPickup = Number.isFinite(pickup.lat) && Number.isFinite(pickup.lng)
  const panel = useRef<HTMLElement>(null)
  const map = useRef<HTMLElement>(null)
  const [expanded, setExpanded] = useState(false)
  // Raise the sheet as far as it goes (it stops just below the top controls) or bring the map back.
  // scrollIntoView works whichever element is the scroll container (window or the app root).
  const toggle = () => {
    const next = !expanded
    setExpanded(next)
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const target = next ? panel.current : map.current
    target?.scrollIntoView?.({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
  }

  return (
    <div className="track-v2" role="region" aria-label={label}>
      <section ref={map} className="track-v2__map" aria-label="Map">
        <p className="sr-only">{hasPickup ? mapSummary : 'Map unavailable.'}</p>
        {hasPickup ? (
          <div className="track-v2__canvas" aria-hidden="true">
            <ChunkBoundary fallback={<Skeleton width="100%" height="100%" radius={0} />}>
              <LiveDriverMap pickup={pickup} driver={driver} stale={stale} showConnector={showConnector} />
            </ChunkBoundary>
          </div>
        ) : <div className="track-v2__nomap">Map unavailable</div>}
        <div className="track-v2__top">
          {onBack && (
            <button type="button" className="track-v2__back" aria-label="Back to Home" onClick={onBack}>
              <ChevronLeft size={22} aria-hidden="true" />
            </button>
          )}
          {chip}
          {onSafety && (
            <button type="button" className="track-v2__back track-v2__safety" aria-label="Safety and 911" aria-haspopup="dialog" onClick={onSafety}>
              <ShieldCheck size={20} aria-hidden="true" />
            </button>
          )}
        </div>
        {overlay && <div className="track-v2__overlay" aria-hidden="true">{overlay}</div>}
      </section>
      <section ref={panel} className="track-v2__panel">
        <button type="button" className="track-v2__handle" aria-label={expanded ? 'Show the map' : 'Show all details'} aria-expanded={expanded} onClick={toggle}>
          <span aria-hidden="true" />
        </button>
        {children}
      </section>
    </div>
  )
}

/** Pickup (and tow drop-off) as a compact two-stop route. */
export function TripStops({ pickup, dropoff, done = false }: { pickup: string; dropoff?: string; done?: boolean }) {
  return (
    <ol className="trip-stops" aria-label="Route">
      <li className={done ? 'is-done' : ''}>
        <span className="trip-stops__dot" aria-hidden="true"><MapPin size={14} /></span>
        <span><small>{dropoff ? 'Pick up' : 'Service location'}</small><strong>{pickup}</strong></span>
      </li>
      {dropoff && (
        <li>
          <span className="trip-stops__dot trip-stops__dot--end" aria-hidden="true"><Flag size={13} /></span>
          <span><small>Drop off</small><strong>{dropoff}</strong></span>
        </li>
      )}
    </ol>
  )
}
