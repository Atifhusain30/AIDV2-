import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cardLabel, usePaymentStore } from './usePaymentStore'
import { apiService } from '../services/api'
import { resetUserState } from '../auth/signOut'

vi.mock('../services/api', () => ({ apiService: { listPaymentMethods: vi.fn(), removePaymentMethod: vi.fn() } }))

const VISA = { id: 'pm_visa', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 }
const AMEX = { id: 'pm_amex', brand: 'amex', last4: '0005', expMonth: 3, expYear: 2029 }

beforeEach(() => { vi.clearAllMocks(); usePaymentStore.getState().reset() })

describe('saved cards (C2)', () => {
  it('labels cards by brand and last four only', () => {
    expect(cardLabel(VISA)).toBe('Visa •••• 4242')
    expect(cardLabel({ brand: 'unknown', last4: '1111' })).toBe('Card •••• 1111')
  })

  it('loads cards and picks the first one to pay with', async () => {
    vi.mocked(apiService.listPaymentMethods).mockResolvedValue({ success: true, data: { enabled: true, methods: [VISA, AMEX] } })
    await usePaymentStore.getState().load()
    expect(usePaymentStore.getState()).toMatchObject({ enabled: true, status: 'ready', selectedId: 'pm_visa' })
  })

  it('removing the selected card falls back to the next one', async () => {
    usePaymentStore.setState({ enabled: true, status: 'ready', cards: [VISA, AMEX], selectedId: 'pm_visa' })
    vi.mocked(apiService.removePaymentMethod).mockResolvedValue({ success: true })
    expect(await usePaymentStore.getState().remove('pm_visa')).toBe(true)
    expect(usePaymentStore.getState()).toMatchObject({ cards: [AMEX], selectedId: 'pm_amex' })
  })

  it('a failed removal keeps the card and explains why', async () => {
    usePaymentStore.setState({ enabled: true, status: 'ready', cards: [VISA], selectedId: 'pm_visa' })
    vi.mocked(apiService.removePaymentMethod).mockResolvedValue({ success: false, error: 'Card not found' })
    expect(await usePaymentStore.getState().remove('pm_visa')).toBe(false)
    expect(usePaymentStore.getState()).toMatchObject({ cards: [VISA], error: 'Card not found' })
  })

  it('signing out forgets the cards', () => {
    usePaymentStore.setState({ enabled: true, status: 'ready', cards: [VISA], selectedId: 'pm_visa' })
    resetUserState()
    expect(usePaymentStore.getState()).toMatchObject({ enabled: false, cards: [], selectedId: null, status: 'idle' })
  })
})
