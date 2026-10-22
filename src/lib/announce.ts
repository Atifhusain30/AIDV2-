/**
 * Screen-reader announcements (F4). The visible screens already update; these hooks decide what
 * VoiceOver / TalkBack should *say* when something changes without the person touching the screen
 * — a job status change, a new ETA — without chattering on every location tick.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

/** ETA changes are read out at most this often, and only when the minutes actually change. */
export const ETA_ANNOUNCE_MIN_MS = 60_000

export interface EtaHeard { minutes: number; at: number }

/** Should a new ETA be read out? Never the first one (it's on screen), then ≤ once a minute. */
export function shouldAnnounceEta(last: EtaHeard | null, minutes: number | null | undefined, now: number): boolean {
  if (minutes == null || !last) return false
  return minutes !== last.minutes && now - last.at >= ETA_ANNOUNCE_MIN_MS
}

/**
 * A polite message for a live region. `announce` sets new text; saying the same thing twice still
 * re-announces (a zero-width toggle makes the text node differ).
 */
export function useAnnouncer(): [string, (text: string) => void] {
  const [message, setMessage] = useState('')
  const flip = useRef(false)
  const announce = useCallback((text: string) => {
    flip.current = !flip.current
    setMessage(text + (flip.current ? '\u200b' : ''))
  }, [])
  return [message, announce]
}

/** Announce `text` whenever `key` changes after the first render (e.g. key = job status). */
export function useAnnounceOnChange(key: string | null | undefined, text: string, announce: (text: string) => void) {
  const last = useRef(key)
  const latestText = useRef(text)
  latestText.current = text
  useEffect(() => {
    if (last.current === key) return
    last.current = key
    if (key != null) announce(latestText.current)
  }, [key, announce])
}

/** Announce an ETA when the minutes change, at most once per ETA_ANNOUNCE_MIN_MS. */
export function useEtaAnnouncement(minutes: number | null | undefined, text: (minutes: number) => string, announce: (text: string) => void, clock: () => number = Date.now) {
  const heard = useRef<EtaHeard | null>(null)
  const textRef = useRef(text)
  textRef.current = text
  useEffect(() => {
    if (minutes == null) return
    const now = clock()
    if (!heard.current) { heard.current = { minutes, at: now }; return }
    if (shouldAnnounceEta(heard.current, minutes, now)) {
      heard.current = { minutes, at: now }
      announce(textRef.current(minutes))
    }
  }, [minutes, announce, clock])
}
