/**
 * B15: the one reminder on app open. If a completed job still waits for a rating (skipped right
 * after the job, or finished while the app was closed), ask once; "Not now" means we don't ask
 * again for that job — it can still be rated from the receipt until the window closes.
 */

import { useEffect, useState } from 'react'
import { apiService } from '../../services/api'
import { markRatingReminded, pickReminder, type PendingRating } from '../../lib/ratings'
import ChunkBoundary from '../ui/ChunkBoundary'
import { lazyWithRetry } from '../../lib/lazyWithRetry'

const RatingSheet = lazyWithRetry(() => import('./RatingSheet'))

interface Props {
  userId: string | null | undefined
  /** A booking whose rating is already being asked elsewhere right now (e.g. its receipt is open). */
  busyBookingId?: () => string | null
  /** Wait before checking so the app's first screen and any receipt settle first. */
  delayMs?: number
}

export default function PendingRatingReminder({ userId, busyBookingId, delayMs = 1200 }: Props) {
  const [reminder, setReminder] = useState<PendingRating | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const timer = setTimeout(() => {
      void apiService.listPendingRatings().then((result) => {
        if (cancelled || !result.success || !result.data?.length) return
        const next = pickReminder(userId, result.data, busyBookingId?.() ?? null)
        if (!next) return
        markRatingReminded(userId, next.bookingId) // once, even if the app closes with it open
        setReminder(next)
      })
    }, delayMs)
    return () => { cancelled = true; clearTimeout(timer) }
    // Once per signed-in account per app open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  if (!reminder) return null
  return <ChunkBoundary><RatingSheet pending={reminder} context="reminder" onRated={() => setReminder(null)} onSkip={() => setReminder(null)} /></ChunkBoundary>
}
