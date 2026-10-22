/**
 * Loading state for the customer's service history (F5). The bookings themselves live in
 * useAppStore.bookingHistory (saved on the phone, owner-stamped); this module only tracks whether
 * the latest copy from the server is loading, loaded or failed, so Activity can show a skeleton on
 * first load, an error with Try again, or the saved list with a "couldn't refresh" note.
 */

import { create } from 'zustand'
import { apiService } from '../services/api'
import { useAppStore } from '../store/useAppStore'
import type { ApiResponse, Booking } from '../types'

export type HistoryLoad = 'idle' | 'loading' | 'ready' | 'error'

export const useHistoryLoad = create<{ status: HistoryLoad; error: string | null }>(() => ({ status: 'idle', error: null }))

export function markHistoryLoading() {
  useHistoryLoad.setState({ status: 'loading', error: null })
}

/** Store the server's answer: the list (newest first, as the server sends it) or the error. */
export function applyHistoryResult(result: ApiResponse<Booking[]>): boolean {
  if (!result.success || !result.data) {
    useHistoryLoad.setState({ status: 'error', error: result.error || 'Unable to load your activity.' })
    return false
  }
  useAppStore.setState({ bookingHistory: result.data.slice() })
  useHistoryLoad.setState({ status: 'ready', error: null })
  return true
}

/** Fetch the signed-in customer's bookings again (Try again / pull to refresh). */
export async function loadBookingHistory(): Promise<boolean> {
  markHistoryLoading()
  return applyHistoryResult(await apiService.listBookings())
}

/** Tests / sign-out: back to "not loaded yet". */
export function resetHistoryLoad() {
  useHistoryLoad.setState({ status: 'idle', error: null })
}
