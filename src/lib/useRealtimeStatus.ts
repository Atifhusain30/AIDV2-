/**
 * B11: React side of the shared live-update client (realtime.ts) for screens and sync hooks.
 * No API access here — the connection itself is opened by useRealtimeConnection.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  RECONNECT_NOTICE_MS, realtimeStatus, subscribeRealtime, subscribeRealtimeStatus,
  type RealtimeEvent, type RealtimeStatus,
} from './realtime'

export function useRealtimeStatus(): RealtimeStatus {
  return useSyncExternalStore(subscribeRealtimeStatus, realtimeStatus, realtimeStatus)
}

/** True while live updates are connected (screens then poll only as a safety net). */
export function useRealtimeConnected(): boolean {
  return useRealtimeStatus() === 'open'
}

/** Run `handler` for every live-update signal (the latest handler is always used). */
export function useRealtimeEvents(handler: (event: RealtimeEvent) => void): void {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => subscribeRealtime((event) => ref.current(event)), [])
}

/**
 * Run the latest `task` now; if it's already running, run it once more right after (so the newest
 * change is never missed) without piling up overlapping requests when signals arrive in bursts.
 */
export function useCoalescedRefresh(task: () => Promise<void>): () => Promise<void> {
  const state = useRef({ running: false, again: false })
  const taskRef = useRef(task)
  taskRef.current = task
  return useCallback(async () => {
    const current = state.current
    if (current.running) { current.again = true; return }
    current.running = true
    try {
      do {
        current.again = false
        await taskRef.current()
      } while (current.again)
    } finally {
      current.running = false
    }
  }, [])
}

/**
 * Show "Reconnecting…" only after live updates have been trying to (re)connect for
 * RECONNECT_NOTICE_MS — never for a short blip, and never while they're simply off.
 */
export function useReconnectingNotice(): boolean {
  const status = useRealtimeStatus()
  const trying = status === 'connecting' || status === 'reconnecting'
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!trying) { setShow(false); return }
    const timer = window.setTimeout(() => setShow(true), RECONNECT_NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [trying])
  return trying && show
}
