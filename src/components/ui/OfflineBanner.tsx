/**
 * Offline / server-unreachable banner (F5). Shown at the top of every signed-in screen while the
 * phone has no connection or the last AID request could not reach the server. Honest copy: what
 * you see may be out of date; nothing is sent until the connection is back.
 */

import { WifiOff } from 'lucide-react'
import { useConnectivity } from '../../lib/connectivity'

export default function OfflineBanner() {
  const state = useConnectivity()
  if (state === 'online') return null
  return (
    <div className="ui-offline" role="status" data-live-region>
      <WifiOff size={16} aria-hidden="true" />
      <span>
        {state === 'offline'
          ? "You're offline. What you see may be out of date."
          : "Can't reach AID right now. We'll keep trying."}
      </span>
    </div>
  )
}
