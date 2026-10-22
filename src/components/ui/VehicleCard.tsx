/**
 * Vehicle card (design system): a car icon tile (no stock photos), a small label, the vehicle's
 * year make model, and "colour · plate". A button with a chevron when tappable, else static.
 */

import type { ReactNode } from 'react'
import { Car, ChevronRight } from 'lucide-react'
/** A saved (garage) vehicle as the app stores it. */
export interface CardVehicle { year?: number | string; make?: string; model?: string; color?: string; plate?: string }

export function vehicleName(vehicle: CardVehicle): string {
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')
}

export function vehicleMeta(vehicle: CardVehicle): string {
  return [vehicle.color, vehicle.plate].map((part) => (part ?? '').toString().trim()).filter(Boolean).join(' · ')
}

export default function VehicleCard({ vehicle, label, onClick, ariaLabel, trailing, className = '' }: {
  vehicle: CardVehicle
  label?: string
  onClick?: () => void
  ariaLabel?: string
  trailing?: ReactNode
  className?: string
}) {
  const meta = vehicleMeta(vehicle)
  const body = (
    <>
      <span className="ui-vehicle__icon" aria-hidden="true"><Car size={22} /></span>
      <span className="ui-vehicle__text">
        {label && <small>{label}</small>}
        <strong>{vehicleName(vehicle)}</strong>
        {meta && <span>{meta}</span>}
      </span>
      {trailing}
      {onClick && !trailing && <ChevronRight className="ui-vehicle__chevron" size={18} aria-hidden="true" />}
    </>
  )
  return onClick
    ? <button type="button" className={`ui-vehicle ${className}`.trim()} aria-label={ariaLabel} onClick={onClick}>{body}</button>
    : <div className={`ui-vehicle ${className}`.trim()}>{body}</div>
}
