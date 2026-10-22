/** B12: the "Message" button on the job screens, with the unread count from the booking poll. */

import { MessageCircle } from 'lucide-react'
import { badgeText, messageButtonLabel } from '../../lib/chat'

export function MessageButton({ name, unread, onClick }: { name: string; unread: number; onClick: () => void }) {
  return (
    <button type="button" className="job-call job-call--message" aria-label={messageButtonLabel(name, unread)} onClick={onClick}>
      <MessageCircle size={19} aria-hidden="true" />
      {unread > 0 && <span className="job-call__badge" aria-hidden="true">{badgeText(unread)}</span>}
    </button>
  )
}
