/** How a service request is shown in lists and details: icon, status words, status tone, dates. */

import { Battery, Car, CircleDot, Fuel, KeyRound, Truck, Wrench, Zap } from 'lucide-react'
import type { BookingStatus, ServiceType } from '../types'
import { formatPrice } from './money'

export const serviceIcons: Partial<Record<ServiceType, typeof Wrench>> = {
  battery_jump: Battery,
  flat_tire: CircleDot,
  lockout: KeyRound,
  towing: Truck,
  ev_charging: Zap,
  fuel_delivery: Fuel,
  oil_change: Car,
}

export const serviceIcon = (id: ServiceType) => serviceIcons[id] ?? Wrench

export const statusLabels: Record<BookingStatus, string> = {
  pending: 'Pending',
  searching: 'Finding a driver',
  accepted: 'Driver assigned',
  en_route: 'On the way',
  arrived: 'Arrived',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  expired: 'No driver found',
}

/** Chip tone for a status: red for ended without service, violet while live, green when done. */
export function statusTone(status: BookingStatus): 'danger' | 'brand' | 'success' {
  if (status === 'cancelled' || status === 'expired') return 'danger'
  if (status === 'completed') return 'success'
  return 'brand'
}

/**
 * What the customer paid, as shown in Activity and service details. A request that ended without
 * service (cancelled / no driver found) costs nothing — AID charges no cancellation fee — so it
 * reads "No charge" rather than a price that looks like a charge. Only a recorded successful
 * payment on such a request shows an amount.
 */
export function chargeLabel(booking: { status: BookingStatus; finalPrice?: number; estimatedPrice: number; payment?: { status: string } }) {
  const ended = booking.status === 'cancelled' || booking.status === 'expired'
  if (ended && booking.payment?.status !== 'succeeded') return { text: 'No charge', muted: true }
  return { text: formatPrice(booking.finalPrice ?? booking.estimatedPrice), muted: ended }
}

export const dayLabel = (value: Date | string) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
export const timeLabel = (value: Date | string) => new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
export const monthLabel = (value: Date | string) => new Date(value).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
