/**
 * B12: chat between the customer and the driver of a job (text only). The server decides everything
 * (who can read/send, when the chat is open, read-only or hidden, blocks, the rate limit — see
 * server/chat.js); this file holds the shared types, the mirrored limits and small pure helpers.
 * There are no canned or automatic messages: every message was typed by one of the two people.
 */

import type { SupportAudience } from './support'

/** Mirrors server/chat.js MESSAGE_MAX. */
export const CHAT_MESSAGE_MAX = 1000
/** While the chat is open, poll for new messages this often (the booking poll keeps the badge current otherwise). */
export const CHAT_POLL_MS = 3000
/** Show a character counter once the text gets this close to the limit. */
export const CHAT_COUNTER_FROM = 800

export type ChatState = 'open' | 'read_only' | 'blocked' | 'closed' | 'unavailable'

/** Sent with every booking a participant polls (GET /bookings/:id, /bookings/active). */
export interface BookingChat {
  state: ChatState
  unread: number
  blockedByMe: boolean
  /** Ended jobs: when the read-only chat disappears from the apps (ISO). */
  readOnlyUntil: string | null
}

export interface ChatMessage {
  id: string
  /** Polling cursor (bigint as a string). */
  seq: string
  mine: boolean
  senderRole: 'customer' | 'driver'
  body: string
  createdAt: string
  readAt: string | null
}

export interface ChatPage extends BookingChat {
  bookingStatus: string
  messages: ChatMessage[]
  cursor: string | null
  maxLength: number
}

export interface BlockResult {
  blocked: true
  alreadyBlocked: boolean
  /** What to do instead while the job is still going (blocking never cancels it). */
  guidance: string | null
  chat: BookingChat
}

/** A message this phone is sending (or failed to send). */
export interface PendingMessage {
  clientId: string
  body: string
  status: 'sending' | 'failed'
  error?: string
  createdAt: string
}

/** Server answer codes that mean the chat can no longer take messages, and the state they imply. */
export const CHAT_CODE_STATES: Record<string, ChatState> = {
  chat_read_only: 'read_only',
  chat_blocked: 'blocked',
  chat_closed: 'closed',
  chat_not_open: 'unavailable',
}

/** Report-from-chat category: the other person's behaviour (the person can change it in the form). */
export const CHAT_REPORT_CATEGORY: Record<SupportAudience, string> = {
  customer: 'driver_behaviour',
  driver: 'customer_behaviour',
}

/** A random id for a message being sent, so a retry is stored once (server: [A-Za-z0-9_-]{8,64}). */
export function newClientId(): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `m-${random}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)
}

/** Add newly fetched messages to the list: in seq order, no duplicates (a sent message can also arrive by polling). */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (!incoming.length) return current
  const byId = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) byId.set(message.id, message)
  return [...byId.values()].sort((a, b) => (BigInt(a.seq) < BigInt(b.seq) ? -1 : BigInt(a.seq) > BigInt(b.seq) ? 1 : 0))
}

/** The highest seq in the list (the cursor for the next poll), or null. */
export function lastSeq(messages: ChatMessage[]): string | null {
  return messages.length ? messages[messages.length - 1].seq : null
}

/** Can a message be sent in this state? */
export const canSend = (state: ChatState | undefined) => state === 'open'

/** Show the Message button on a job screen? (Hidden only when there's nothing to show.) */
export const showChatEntry = (chat: BookingChat | undefined) => !chat || (chat.state !== 'closed' && chat.state !== 'unavailable')

/** Mirrors server/chat.js READ_ONLY_HOURS. */
export const CHAT_READ_ONLY_HOURS = 24

/**
 * Can this ended job's chat still be read (completed/cancelled with a driver, within 24 h)? Used to
 * offer "Messages" in the job details; the server makes the real decision.
 */
export function endedChatReadable(booking: { status: string; driverId?: string; completedAt?: Date; cancelledAt?: Date }, now: number = Date.now()): boolean {
  if (!booking.driverId) return false
  const ended = booking.status === 'completed' ? booking.completedAt : booking.status === 'cancelled' ? booking.cancelledAt : undefined
  const at = ended ? new Date(ended).getTime() : NaN
  return Number.isFinite(at) && now < at + CHAT_READ_ONLY_HOURS * 3600000
}

/** "3:05 PM" today, "Oct 21, 3:05 PM" on other days. */
export function messageTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return date.toDateString() === now.toDateString() ? time : `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`
}

/** The banner text for a chat that can't take messages, from this person's side. */
export function chatClosedText(chat: Pick<BookingChat, 'state' | 'blockedByMe' | 'readOnlyUntil'>, otherName: string, now: Date = new Date()): string | null {
  switch (chat.state) {
    case 'read_only': {
      const until = chat.readOnlyUntil ? new Date(chat.readOnlyUntil) : null
      const when = until ? ` until ${messageTime(until.toISOString(), now)}` : ''
      return `This job has ended. You can read this chat${when}, but not send messages.`
    }
    case 'blocked':
      return chat.blockedByMe
        ? `You blocked ${otherName}. Neither of you can send messages on this job, and AID won't match you again.`
        : 'Chat is closed for this job.'
    case 'closed':
      return 'This chat is no longer available.'
    case 'unavailable':
      return 'You can message once a driver accepts the request.'
    default:
      return null
  }
}

/** Accessible label for the Message button, e.g. "Message Marcus, 2 unread". */
export function messageButtonLabel(name: string, unread: number): string {
  return unread > 0 ? `Message ${name}, ${unread} unread` : `Message ${name}`
}

/** Badge text: up to 9, then "9+". */
export const badgeText = (unread: number) => (unread > 9 ? '9+' : String(unread))
