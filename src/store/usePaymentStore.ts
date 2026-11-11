/**
 * C2: the customer's saved cards (brand + last four only; Stripe keeps the numbers).
 * `enabled` comes from the server: when card payments are off, nothing asks for a card.
 */

import { create } from 'zustand'
import { apiService, type SavedCard } from '../services/api'

/** C3: the cancellation rules the server applies (shown before a customer cancels). */
export interface CancellationPolicy {
  cancellationFee: number
  freeCancelMinutes: number
}

interface PaymentState {
  enabled: boolean
  policy: CancellationPolicy | null
  cards: SavedCard[]
  /** The card new requests are held on (defaults to the first saved card). */
  selectedId: string | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  load: () => Promise<void>
  select: (id: string) => void
  remove: (id: string) => Promise<boolean>
  reset: () => void
}

const initial = { enabled: false, policy: null as CancellationPolicy | null, cards: [] as SavedCard[], selectedId: null as string | null, status: 'idle' as const, error: null as string | null }

export const usePaymentStore = create<PaymentState>((set, get) => ({
  ...initial,

  load: async () => {
    set({ status: 'loading', error: null })
    const result = await apiService.listPaymentMethods()
    if (!result.success || !result.data) {
      set({ status: 'error', error: result.error || 'Unable to load your cards.' })
      return
    }
    const { enabled, methods, policy } = result.data
    const previous = get().selectedId
    set({
      enabled, cards: methods, status: 'ready', policy: policy ?? null,
      selectedId: methods.some((card) => card.id === previous) ? previous : methods[0]?.id ?? null,
    })
  },

  select: (id) => { if (get().cards.some((card) => card.id === id)) set({ selectedId: id }) },

  remove: async (id) => {
    const result = await apiService.removePaymentMethod(id)
    if (!result.success) {
      set({ error: result.error || 'Unable to remove this card.' })
      return false
    }
    const cards = get().cards.filter((card) => card.id !== id)
    set({ cards, error: null, selectedId: get().selectedId === id ? cards[0]?.id ?? null : get().selectedId })
    return true
  },

  reset: () => set({ ...initial }),
}))

const BRANDS: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', discover: 'Discover', diners: 'Diners', jcb: 'JCB', unionpay: 'UnionPay' }

/**
 * C3: what cancelling right now costs, in words — mirrors the server rule (payments.js): a fee only
 * once a driver is on the way and the free window since acceptance has passed; never above the price.
 */
export function cancellationNotice(
  booking: { status: string; acceptedAt?: Date | string; estimatedPrice: number; payment?: { status: string } },
  policy: CancellationPolicy | null,
  nowMs = Date.now(),
): { fee: number; text: string } | null {
  if (!policy || !policy.cancellationFee || booking.payment?.status !== 'authorized') return null
  if (!['accepted', 'en_route'].includes(booking.status) || !booking.acceptedAt) return null
  const fee = Math.min(policy.cancellationFee, booking.estimatedPrice)
  const feeText = `$${fee % 1 === 0 ? fee.toFixed(0) : fee.toFixed(2)}`
  const freeUntil = new Date(booking.acceptedAt).getTime() + policy.freeCancelMinutes * 60000
  const minutesLeft = Math.ceil((freeUntil - nowMs) / 60000)
  if (minutesLeft > 0) {
    return { fee: 0, text: `Free to cancel for ${minutesLeft} more minute${minutesLeft === 1 ? '' : 's'}. After that, a ${feeText} cancellation fee applies because your driver is on the way.` }
  }
  return { fee, text: `A ${feeText} cancellation fee will be charged to your card, because your driver is already on the way. The rest of the hold is released.` }
}

/** "Visa •••• 4242" */
export function cardLabel(card: Pick<SavedCard, 'brand' | 'last4'>): string {
  return `${BRANDS[card.brand] ?? 'Card'} •••• ${card.last4}`
}
