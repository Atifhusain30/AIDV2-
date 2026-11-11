/**
 * C2: the customer's saved cards (brand + last four only; Stripe keeps the numbers).
 * `enabled` comes from the server: when card payments are off, nothing asks for a card.
 */

import { create } from 'zustand'
import { apiService, type SavedCard } from '../services/api'

interface PaymentState {
  enabled: boolean
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

const initial = { enabled: false, cards: [] as SavedCard[], selectedId: null as string | null, status: 'idle' as const, error: null as string | null }

export const usePaymentStore = create<PaymentState>((set, get) => ({
  ...initial,

  load: async () => {
    set({ status: 'loading', error: null })
    const result = await apiService.listPaymentMethods()
    if (!result.success || !result.data) {
      set({ status: 'error', error: result.error || 'Unable to load your cards.' })
      return
    }
    const { enabled, methods } = result.data
    const previous = get().selectedId
    set({
      enabled, cards: methods, status: 'ready',
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

/** "Visa •••• 4242" */
export function cardLabel(card: Pick<SavedCard, 'brand' | 'last4'>): string {
  return `${BRANDS[card.brand] ?? 'Card'} •••• ${card.last4}`
}
