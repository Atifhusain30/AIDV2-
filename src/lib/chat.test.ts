import { describe, expect, it } from 'vitest'
import serverChatSource from '../../server/chat.js?raw'
import {
  CHAT_CODE_STATES, CHAT_MESSAGE_MAX, CHAT_READ_ONLY_HOURS, CHAT_REPORT_CATEGORY, badgeText, chatClosedText, endedChatReadable, lastSeq, mergeMessages,
  messageButtonLabel, newClientId, showChatEntry, type ChatMessage,
} from './chat'
import { REPORT_CATEGORIES } from './support'

const message = (seq: number, overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `m${seq}`, seq: String(seq), mine: false, senderRole: 'driver', body: `b${seq}`, createdAt: '2026-10-22T19:00:00Z', readAt: null, ...overrides,
})

describe('chat helpers (B12)', () => {
  it('mirrors the server limit and answer codes', () => {
    // Evaluate the server's CommonJS rules module (no imports) to compare with the client mirror.
    const loaded: { exports: Record<string, unknown> } = { exports: {} }
    new Function('module', 'exports', serverChatSource)(loaded, loaded.exports)
    const server = loaded.exports as { MESSAGE_MAX: number; READ_ONLY_HOURS: number; CHAT_CODES: Record<string, string> }
    expect(CHAT_MESSAGE_MAX).toBe(server.MESSAGE_MAX)
    expect(CHAT_READ_ONLY_HOURS).toBe(server.READ_ONLY_HOURS)
    for (const code of ['notOpen', 'readOnly', 'closed', 'blocked']) expect(Object.keys(CHAT_CODE_STATES)).toContain(server.CHAT_CODES[code])
  })

  it('merges polled and just-sent messages in order without duplicates', () => {
    const merged = mergeMessages([message(1), message(3)], [message(2), message(3, { body: 'b3' }), message(10)])
    expect(merged.map((m) => m.seq)).toEqual(['1', '2', '3', '10'])
    expect(lastSeq(merged)).toBe('10')
    expect(lastSeq([])).toBeNull()
  })

  it('job details offer the ended chat only within 24 hours and only when a driver was on it', () => {
    const now = Date.parse('2026-10-22T19:00:00Z')
    const hoursAgo = (h: number) => new Date(now - h * 3600000)
    expect(endedChatReadable({ status: 'completed', driverId: 'd', completedAt: hoursAgo(2) }, now)).toBe(true)
    expect(endedChatReadable({ status: 'cancelled', driverId: 'd', cancelledAt: hoursAgo(23) }, now)).toBe(true)
    expect(endedChatReadable({ status: 'completed', driverId: 'd', completedAt: hoursAgo(25) }, now)).toBe(false)
    expect(endedChatReadable({ status: 'cancelled', cancelledAt: hoursAgo(1) }, now)).toBe(false)
    expect(endedChatReadable({ status: 'expired', driverId: 'd' }, now)).toBe(false)
  })

  it('client ids are unique and acceptable to the server', () => {
    const a = newClientId()
    expect(a).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
    expect(newClientId()).not.toBe(a)
  })

  it('report from chat preselects the other person’s behaviour from each side’s list', () => {
    expect(CHAT_REPORT_CATEGORY).toEqual({ customer: 'driver_behaviour', driver: 'customer_behaviour' })
    expect(REPORT_CATEGORIES.customer.map((c) => c.id)).toContain(CHAT_REPORT_CATEGORY.customer)
    expect(REPORT_CATEGORIES.driver.map((c) => c.id)).toContain(CHAT_REPORT_CATEGORY.driver)
  })

  it('explains a closed chat honestly from each side', () => {
    expect(chatClosedText({ state: 'open', blockedByMe: false, readOnlyUntil: null }, 'Marcus')).toBeNull()
    expect(chatClosedText({ state: 'blocked', blockedByMe: true, readOnlyUntil: null }, 'Marcus')).toMatch(/You blocked Marcus/)
    expect(chatClosedText({ state: 'blocked', blockedByMe: false, readOnlyUntil: null }, 'Marcus')).toBe('Chat is closed for this job.')
    expect(chatClosedText({ state: 'read_only', blockedByMe: false, readOnlyUntil: '2026-10-23T19:00:00Z' }, 'Marcus')).toMatch(/This job has ended/)
    expect(showChatEntry(undefined)).toBe(true)
    expect(showChatEntry({ state: 'closed', unread: 0, blockedByMe: false, readOnlyUntil: null })).toBe(false)
    expect(messageButtonLabel('Marcus', 0)).toBe('Message Marcus')
    expect(messageButtonLabel('Marcus', 3)).toBe('Message Marcus, 3 unread')
    expect(badgeText(12)).toBe('9+')
  })
})
