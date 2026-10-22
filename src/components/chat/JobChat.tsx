/**
 * B12: the chat between a job's customer and driver (text only), opened from the tracking screen
 * (customer) or the job screen (driver). Messages come only from the server — polled every
 * CHAT_POLL_MS while this is open — and every message was typed by one of the two people.
 * Sending shows "Sending…", a failure shows "Not sent" with Retry (same client id, so the server
 * stores it once). From here either person can report the other (the B18 form, prefilled) or block them.
 */

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Ban, ChevronLeft, Flag, Loader2, MessageCircle, MoreVertical, RotateCcw, SendHorizontal, ShieldCheck } from 'lucide-react'
import { apiService } from '../../services/api'
import { ConfirmSheet, ReportIssueSheet } from '../job/JobSheets'
import {
  CHAT_CODE_STATES, CHAT_COUNTER_FROM, CHAT_MESSAGE_MAX, CHAT_POLL_MS, CHAT_REPORT_CATEGORY,
  canSend, chatClosedText, lastSeq, mergeMessages, messageTime, newClientId,
  type BookingChat, type ChatMessage, type ChatState, type PendingMessage,
} from '../../lib/chat'
import type { SupportAudience } from '../../lib/support'

interface JobChatProps {
  bookingId: string
  /** Who is using the chat (decides the report categories and wording). */
  audience: SupportAudience
  /** The other person's first name ("Marcus"). */
  otherName: string
  serviceName: string
  /** The chat state from the last booking poll, so the screen opens in the right state. */
  initialChat?: BookingChat
  onClose: () => void
  /** Tell the job screen what changed (unread cleared, blocked) so its badge and store stay in step. */
  onChatChange?: (chat: Partial<BookingChat>) => void
}

type Sheet = 'menu' | 'report' | 'block' | null

export default function JobChat({ bookingId, audience, otherName, serviceName, initialChat, onClose, onChatChange }: JobChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [pending, setPending] = useState<PendingMessage[]>([])
  const [chat, setChat] = useState<Pick<BookingChat, 'state' | 'blockedByMe' | 'readOnlyUntil'>>({
    state: initialChat?.state ?? 'open', blockedByMe: initialChat?.blockedByMe ?? false, readOnlyUntil: initialChat?.readOnlyUntil ?? null,
  })
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [blocking, setBlocking] = useState(false)
  const [blockError, setBlockError] = useState<string | null>(null)
  const [guidance, setGuidance] = useState<string | null>(null)
  const cursor = useRef<string | null>(null)
  const loadedRef = useRef(false)
  const listRef = useRef<HTMLOListElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const ids = { title: useId(), input: useId(), count: useId(), menu: useId() }
  const onChatChangeRef = useRef(onChatChange)
  onChatChangeRef.current = onChatChange

  const applyState = useCallback((state: ChatState, extra: Partial<BookingChat> = {}) => {
    setChat((current) => ({ ...current, state, ...extra }))
    onChatChangeRef.current?.({ state, ...extra })
  }, [])

  // Poll for new messages while the chat is open; mark the other person's messages read as they arrive.
  useEffect(() => {
    let stopped = false
    let inFlight = false
    // The first load always runs; later polls pause while the app is in the background.
    const refresh = async (force = false) => {
      if (inFlight || (!force && typeof document !== 'undefined' && document.visibilityState === 'hidden')) return
      inFlight = true
      try {
        const result = await apiService.listJobMessages(bookingId, cursor.current)
        if (stopped) return
        if (!result.success || !result.data) {
          const state = result.code ? CHAT_CODE_STATES[result.code] : undefined
          if (state) {
            applyState(state)
            if (state === 'closed') setMessages([])
          } else if (!loadedRef.current) {
            // Only the first load shows an error; a later failed poll keeps what's on screen and tries again.
            setLoadError(result.error || 'Unable to load messages.')
          }
          setLoaded(true)
          return
        }
        const page = result.data
        setLoadError(null)
        loadedRef.current = true
        setLoaded(true)
        setChat({ state: page.state, blockedByMe: page.blockedByMe, readOnlyUntil: page.readOnlyUntil })
        if (page.messages.length) {
          setMessages((current) => mergeMessages(current, page.messages))
          cursor.current = page.cursor
          if (page.messages.some((message) => !message.mine && !message.readAt)) {
            const read = await apiService.markJobMessagesRead(bookingId, page.cursor)
            if (!stopped && read.success) onChatChangeRef.current?.({ unread: 0 })
          }
        }
      } finally {
        inFlight = false
      }
    }
    void refresh(true)
    const timer = window.setInterval(() => void refresh(), CHAT_POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [bookingId, applyState])

  // Keep the newest message in view.
  useEffect(() => {
    const list = listRef.current
    if (list && typeof list.scrollTo === 'function') list.scrollTo({ top: list.scrollHeight })
  }, [messages.length, pending.length])

  // Escape closes the chat (or the open sheet first).
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (sheet) setSheet(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet, onClose])

  const deliver = async (message: PendingMessage) => {
    setPending((current) => current.map((item) => (item.clientId === message.clientId ? { ...item, status: 'sending', error: undefined } : item)))
    const result = await apiService.sendJobMessage(bookingId, message.body, message.clientId)
    if (result.success && result.data) {
      const saved = result.data
      setMessages((current) => mergeMessages(current, [saved]))
      setPending((current) => current.filter((item) => item.clientId !== message.clientId))
      return
    }
    const state = result.code ? CHAT_CODE_STATES[result.code] : undefined
    if (state) applyState(state)
    setPending((current) => current.map((item) => (item.clientId === message.clientId
      ? { ...item, status: 'failed', error: result.error || 'Not sent.' }
      : item)))
  }

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    const body = text.trim()
    if (!body || !canSend(chat.state)) return
    const message: PendingMessage = { clientId: newClientId(), body, status: 'sending', createdAt: new Date().toISOString() }
    setPending((current) => [...current, message])
    setText('')
    void deliver(message)
    inputRef.current?.focus()
  }

  // Enter sends on a hardware keyboard; Shift+Enter adds a line.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) submit(event as unknown as FormEvent)
  }

  const block = async () => {
    setBlocking(true)
    setBlockError(null)
    const result = await apiService.blockJobParty(bookingId)
    setBlocking(false)
    if (!result.success || !result.data) {
      setBlockError(result.error || `Unable to block ${otherName}. Try again.`)
      return
    }
    setSheet(null)
    setGuidance(result.data.guidance)
    applyState('blocked', { blockedByMe: true })
    // Anything not yet sent can't be sent now.
    setPending((current) => current.filter((item) => item.status === 'sending'))
  }

  const sendable = canSend(chat.state)
  const closedText = chatClosedText(chat, otherName)
  const nothingYet = loaded && !loadError && messages.length === 0 && pending.length === 0

  // Rendered on <body> so it sits above the bottom navigation and isn't clipped by animated job screens.
  return createPortal(
    <div className="chat-screen" role="dialog" aria-modal="true" aria-labelledby={ids.title}>
      <header className="chat-header">
        <button type="button" className="chat-icon-button" aria-label="Close chat" onClick={onClose}><ChevronLeft size={22} aria-hidden="true" /></button>
        <div className="chat-header__title">
          <h1 id={ids.title}>{otherName}</h1>
          <small>{serviceName} · {audience === 'customer' ? 'your driver' : 'your customer'}</small>
        </div>
        <button type="button" className="chat-icon-button" aria-label="Chat options" aria-haspopup="menu" aria-expanded={sheet === 'menu'} aria-controls={ids.menu}
          onClick={() => setSheet(sheet === 'menu' ? null : 'menu')}>
          <MoreVertical size={20} aria-hidden="true" />
        </button>
        {sheet === 'menu' && (
          <div id={ids.menu} className="chat-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => setSheet('report')}><Flag size={17} aria-hidden="true" /> Report {otherName}</button>
            {!chat.blockedByMe && (
              <button type="button" role="menuitem" className="chat-menu__danger" onClick={() => { setBlockError(null); setSheet('block') }}>
                <Ban size={17} aria-hidden="true" /> Block {otherName}
              </button>
            )}
          </div>
        )}
      </header>

      <ol ref={listRef} className="chat-list" role="log" aria-live="polite" aria-relevant="additions" aria-label={`Messages with ${otherName}`}>
        {!loaded && <li className="chat-status"><Loader2 size={18} className="animate-spin" aria-hidden="true" /> Loading messages…</li>}
        {loadError && <li className="chat-status chat-status--error" role="alert"><AlertCircle size={16} aria-hidden="true" /> {loadError}</li>}
        {nothingYet && (
          <li className="chat-empty">
            <MessageCircle size={30} aria-hidden="true" />
            <strong>No messages yet</strong>
            <span>{sendable ? `Send ${otherName} a message about this job.` : 'Nothing was sent on this job.'}</span>
            <span className="chat-empty__privacy"><ShieldCheck size={14} aria-hidden="true" /> Messages stay in this job. Your phone number and email aren't shown.</span>
          </li>
        )}
        {messages.map((message) => (
          <li key={message.id} className={`chat-bubble ${message.mine ? 'chat-bubble--mine' : 'chat-bubble--theirs'}`}>
            <span className="sr-only">{message.mine ? 'You' : otherName}: </span>
            <p>{message.body}</p>
            <time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time>
          </li>
        ))}
        {pending.map((message) => (
          <li key={message.clientId} className={`chat-bubble chat-bubble--mine${message.status === 'failed' ? ' is-failed' : ' is-sending'}`}>
            <span className="sr-only">You: </span>
            <p>{message.body}</p>
            {message.status === 'sending'
              ? <span className="chat-bubble__meta">Sending…</span>
              : (
                <span className="chat-bubble__meta chat-bubble__meta--failed" role="alert">
                  <AlertCircle size={13} aria-hidden="true" /> Not sent{message.error ? ` — ${message.error}` : ''}
                  {sendable && (
                    <button type="button" className="chat-retry" onClick={() => void deliver(message)} aria-label={`Retry sending: ${message.body.slice(0, 40)}`}>
                      <RotateCcw size={13} aria-hidden="true" /> Retry
                    </button>
                  )}
                </span>
              )}
          </li>
        ))}
      </ol>

      {closedText && (
        <div className={`chat-banner${chat.state === 'blocked' ? ' chat-banner--blocked' : ''}`} role="status">
          <p>{closedText}</p>
          {guidance && <p className="chat-banner__guidance">{guidance}</p>}
        </div>
      )}

      {sendable && (
        <form className="chat-composer" onSubmit={submit}>
          <label htmlFor={ids.input} className="sr-only">Message {otherName}</label>
          <textarea
            id={ids.input}
            ref={inputRef}
            rows={1}
            value={text}
            maxLength={CHAT_MESSAGE_MAX}
            placeholder={`Message ${otherName}`}
            aria-describedby={text.length >= CHAT_COUNTER_FROM ? ids.count : undefined}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
          />
          {text.length >= CHAT_COUNTER_FROM && <small id={ids.count} className="chat-count">{text.length} / {CHAT_MESSAGE_MAX}</small>}
          <button type="submit" className="chat-send" aria-label="Send message" disabled={!text.trim()}>
            <SendHorizontal size={20} aria-hidden="true" />
          </button>
        </form>
      )}

      {sheet === 'report' && (
        <ReportIssueSheet bookingId={bookingId} audience={audience} initialCategory={CHAT_REPORT_CATEGORY[audience]} onClose={() => setSheet(null)} />
      )}
      {sheet === 'block' && (
        <ConfirmSheet
          id="block-person" tone="danger" busy={blocking} error={blockError}
          title={`Block ${otherName}?`}
          text={`Neither of you will be able to send messages on this job, and AID won't match you with ${otherName} again. This doesn't cancel the job — ${audience === 'customer' ? 'you can still cancel per the usual rules or report a problem' : 'you can still cancel with a reason before service starts, or report an issue'}. You can't undo this in the app yet; contact AID support if you blocked by mistake.`}
          confirmLabel={`Block ${otherName}`} busyLabel="Blocking…" keepLabel="Don't block"
          onConfirm={() => void block()} onClose={() => setSheet(null)}
        />
      )}
    </div>,
    document.body,
  )
}
