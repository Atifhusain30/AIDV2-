import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import JobChat from './JobChat'
import { apiService } from '../../services/api'
import type { ChatMessage, ChatPage } from '../../lib/chat'

vi.mock('../../services/api', () => ({
  apiService: {
    listJobMessages: vi.fn(), sendJobMessage: vi.fn(), markJobMessagesRead: vi.fn(), blockJobParty: vi.fn(), createSupportReport: vi.fn(),
  },
}))
const api = vi.mocked(apiService)

const msg = (seq: number, overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `m${seq}`, seq: String(seq), mine: false, senderRole: 'driver', body: `Message ${seq}`, createdAt: new Date().toISOString(), readAt: null, ...overrides,
})
const page = (messages: ChatMessage[], overrides: Partial<ChatPage> = {}): { success: true; data: ChatPage } => ({
  success: true,
  data: { state: 'open', unread: 0, blockedByMe: false, readOnlyUntil: null, bookingStatus: 'en_route', messages, cursor: messages.length ? messages[messages.length - 1].seq : null, maxLength: 1000, ...overrides },
})

function open(props: Partial<Parameters<typeof JobChat>[0]> = {}) {
  const onClose = vi.fn()
  const onChatChange = vi.fn()
  render(<JobChat bookingId="booking-9" audience="customer" otherName="Marcus" serviceName="Towing" onClose={onClose} onChatChange={onChatChange} {...props} />)
  return { onClose, onChatChange }
}

beforeEach(() => {
  vi.clearAllMocks()
  api.listJobMessages.mockResolvedValue(page([]))
  api.markJobMessagesRead.mockResolvedValue({ success: true, data: { marked: 1 } })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('job chat (B12)', () => {
  it('shows an honest empty state and a labelled, length-limited composer', async () => {
    open()
    expect(await screen.findByText('No messages yet')).toBeTruthy()
    expect(screen.getByText(/Your phone number and email aren't shown/)).toBeTruthy()
    const input = screen.getByLabelText('Message Marcus') as HTMLTextAreaElement
    expect(input.maxLength).toBe(1000)
    expect((screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('dialog', { name: 'Marcus' })).toBeTruthy()
    expect(api.listJobMessages).toHaveBeenCalledWith('booking-9', null)
  })

  it('shows both sides with times, and marks the other person’s messages read', async () => {
    api.listJobMessages.mockResolvedValueOnce(page([msg(1, { body: 'On my way' }), msg(2, { mine: true, senderRole: 'customer', body: 'Thanks!' })]))
    const { onChatChange } = open()
    const log = await screen.findByRole('log', { name: 'Messages with Marcus' })
    const items = within(log).getAllByRole('listitem')
    expect(items[0].className).toContain('chat-bubble--theirs')
    expect(items[0].textContent).toMatch(/Marcus: On my way/)
    expect(items[1].className).toContain('chat-bubble--mine')
    expect(items[1].querySelector('time')).toBeTruthy()
    await waitFor(() => expect(api.markJobMessagesRead).toHaveBeenCalledWith('booking-9', '2'))
    await waitFor(() => expect(onChatChange).toHaveBeenCalledWith({ unread: 0 }))
  })

  it('polls for new messages after the cursor while open', async () => {
    vi.useFakeTimers()
    api.listJobMessages.mockResolvedValueOnce(page([msg(4)])).mockResolvedValueOnce(page([msg(5, { body: 'Here now' })]))
    open()
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    expect(screen.getByText('Message 4')).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(api.listJobMessages).toHaveBeenLastCalledWith('booking-9', '4')
    expect(screen.getByText('Here now')).toBeTruthy()
  })

  it('send: shows Sending…, then the saved message', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof apiService.sendJobMessage>>) => void
    api.sendJobMessage.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    open()
    await screen.findByText('No messages yet')
    fireEvent.change(screen.getByLabelText('Message Marcus'), { target: { value: '  Gate code 4411  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect(screen.getByText('Sending…')).toBeTruthy()
    expect((screen.getByLabelText('Message Marcus') as HTMLTextAreaElement).value).toBe('')
    const [, body, clientId] = api.sendJobMessage.mock.calls[0]
    expect(body).toBe('Gate code 4411')
    expect(clientId).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
    await act(async () => { resolve({ success: true, data: msg(7, { mine: true, senderRole: 'customer', body: 'Gate code 4411' }) }) })
    expect(screen.queryByText('Sending…')).toBeNull()
    expect(screen.getByText('Gate code 4411')).toBeTruthy()
  })

  it('failed send: "Not sent" with Retry, which resends with the same id', async () => {
    api.sendJobMessage
      .mockResolvedValueOnce({ success: false, error: 'Unable to reach AID. Check your connection and try again.' })
      .mockResolvedValueOnce({ success: true, data: msg(8, { mine: true, senderRole: 'customer', body: 'Are you close?' }) })
    open()
    await screen.findByText('No messages yet')
    fireEvent.change(screen.getByLabelText('Message Marcus'), { target: { value: 'Are you close?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect(await screen.findByText(/Not sent — Unable to reach AID/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry sending: Are you close?' }))
    await waitFor(() => expect(screen.queryByText(/Not sent/)).toBeNull())
    expect(api.sendJobMessage).toHaveBeenCalledTimes(2)
    expect(api.sendJobMessage.mock.calls[1][2]).toBe(api.sendJobMessage.mock.calls[0][2])
    expect(screen.getByText('Are you close?')).toBeTruthy()
  })

  it('a send refused because the job ended switches to read-only', async () => {
    api.sendJobMessage.mockResolvedValueOnce({ success: false, error: 'This job has ended, so the chat is read-only.', code: 'chat_read_only' })
    open()
    await screen.findByText('No messages yet')
    fireEvent.change(screen.getByLabelText('Message Marcus'), { target: { value: 'Thanks' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect(await screen.findByText(/This job has ended. You can read this chat/)).toBeTruthy()
    expect(screen.queryByLabelText('Message Marcus')).toBeNull()
  })

  it('blocked state: no composer, and the reason from this person’s side', async () => {
    api.listJobMessages.mockResolvedValue(page([msg(1)], { state: 'blocked', blockedByMe: false }))
    open({ audience: 'driver', otherName: 'Casey' })
    expect(await screen.findByText('Chat is closed for this job.')).toBeTruthy()
    expect(screen.queryByLabelText('Message Casey')).toBeNull()
    expect(screen.getByText('Message 1')).toBeTruthy()
  })

  it('block: confirm first, then the chat closes with guidance (the job is not cancelled)', async () => {
    api.blockJobParty.mockResolvedValueOnce({ success: true, data: {
      blocked: true, alreadyBlocked: false,
      guidance: "Blocking doesn't cancel this job. You can cancel the request until your driver arrives, or report a problem to AID. If you're in danger, call 911.",
      chat: { state: 'blocked', unread: 0, blockedByMe: true, readOnlyUntil: null },
    } })
    const { onChatChange } = open()
    await screen.findByText('No messages yet')
    fireEvent.click(screen.getByRole('button', { name: 'Chat options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Block Marcus' }))
    const confirm = screen.getByRole('alertdialog', { name: 'Block Marcus?' })
    expect(within(confirm).getByText(/This doesn't cancel the job/)).toBeTruthy()
    expect(api.blockJobParty).not.toHaveBeenCalled()
    fireEvent.click(within(confirm).getByRole('button', { name: 'Block Marcus' }))
    expect(await screen.findByText(/You blocked Marcus/)).toBeTruthy()
    expect(screen.getByText(/Blocking doesn't cancel this job/)).toBeTruthy()
    expect(screen.queryByLabelText('Message Marcus')).toBeNull()
    expect(api.blockJobParty).toHaveBeenCalledWith('booking-9')
    expect(onChatChange).toHaveBeenCalledWith({ state: 'blocked', blockedByMe: true })
    fireEvent.click(screen.getByRole('button', { name: 'Chat options' }))
    expect(screen.queryByRole('menuitem', { name: 'Block Marcus' })).toBeNull()
  })

  it('report from chat opens the B18 form for this job with the other person’s behaviour selected', async () => {
    api.createSupportReport.mockResolvedValueOnce({ success: true, data: { id: 'r1', category: 'driver_behaviour', categoryLabel: 'Driver behaviour', message: '', status: 'open', booking: { id: 'booking-9', serviceName: 'Towing' }, createdAt: '', updatedAt: null, resolvedAt: null } })
    open()
    await screen.findByText('No messages yet')
    fireEvent.click(screen.getByRole('button', { name: 'Chat options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Report Marcus' }))
    expect(screen.getByRole('heading', { name: 'Report an issue' })).toBeTruthy()
    expect((screen.getByRole('radio', { name: 'Driver behaviour' }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))
    await screen.findByText('Report sent')
    expect(api.createSupportReport).toHaveBeenCalledWith({ category: 'driver_behaviour', message: undefined, bookingId: 'booking-9' })
  })

  it('the driver reports the customer’s behaviour', async () => {
    open({ audience: 'driver', otherName: 'Casey' })
    await screen.findByText('No messages yet')
    fireEvent.click(screen.getByRole('button', { name: 'Chat options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Report Casey' }))
    expect((screen.getByRole('radio', { name: 'Customer behaviour' }) as HTMLInputElement).checked).toBe(true)
  })

  it('a chat past its 24 hours shows that it is no longer available', async () => {
    api.listJobMessages.mockResolvedValue({ success: false, error: 'This chat is no longer available.', code: 'chat_closed' })
    open()
    expect(await screen.findByText('This chat is no longer available.')).toBeTruthy()
    expect(screen.queryByLabelText('Message Marcus')).toBeNull()
  })

  it('Escape and the back button close the chat', async () => {
    const { onClose } = open()
    await screen.findByText('No messages yet')
    fireEvent.click(screen.getByRole('button', { name: 'Close chat' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
