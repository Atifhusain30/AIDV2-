/**
 * B11: opens the one shared live-update stream while something live is on screen (a customer's active
 * request; a driver who is online or on a job), and closes it otherwise. Going to the background
 * (Capacitor appStateChange on phones, page visibility in a browser) closes the stream; coming back
 * reopens it and re-fetches once. Polling in the sync hooks keeps working either way.
 */

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { apiService } from '../services/api'
import { RealtimeClient, getRealtime, setRealtimeFactory, type EventSourceLike } from './realtime'

setRealtimeFactory(() => new RealtimeClient({
  requestTicket: () => apiService.createRealtimeTicket(),
  createEventSource: (url) => {
    if (typeof EventSource === 'undefined') throw new Error('EventSource is not available')
    return new EventSource(url) as unknown as EventSourceLike
  },
}))

export function useRealtimeConnection(enabled: boolean): void {
  useEffect(() => {
    const client = getRealtime()
    if (!client || !enabled) return
    const foreground = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'
    if (foreground()) client.resume()
    else client.pause()
    client.start()
    const onVisibility = () => (foreground() ? client.resume() : client.pause())
    document.addEventListener('visibilitychange', onVisibility)
    let removeNative: (() => void) | null = null
    let disposed = false
    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener('appStateChange', ({ isActive }) => (isActive ? client.resume() : client.pause()))
        .then((handle) => { if (disposed) void handle.remove(); else removeNative = () => void handle.remove() })
        .catch(() => {})
    }
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibility)
      removeNative?.()
      client.stop()
    }
  }, [enabled])
}
