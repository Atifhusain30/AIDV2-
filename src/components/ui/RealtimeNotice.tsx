/**
 * B11: a small "Reconnecting…" pill on live screens, shown only after live updates have been down
 * for a few seconds (RECONNECT_NOTICE_MS). The screen keeps checking the server on its own meanwhile,
 * so the copy says updates may be slower — never that anything is lost or that data is live when it isn't.
 */

import { RefreshCw } from 'lucide-react'
import { useReconnectingNotice } from '../../lib/useRealtimeStatus'

export default function RealtimeNotice() {
  const show = useReconnectingNotice()
  if (!show) return null
  return (
    <div className="realtime-notice" role="status" aria-live="polite">
      <RefreshCw size={13} aria-hidden="true" className="realtime-notice__icon" />
      <span>Reconnecting… updates may be a little slower</span>
    </div>
  )
}
