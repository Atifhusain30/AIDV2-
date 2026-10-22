import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import LocationConfirmModal from './LocationConfirmModal'
import { useAppStore } from '../../store/useAppStore'
import locationService from '../../services/locationService'

vi.mock('../../services/locationService', () => ({
  default: {
    searchAddressSuggestions: vi.fn(),
    getCurrentLocationSelection: vi.fn(),
    reverseGeocodeLabel: vi.fn(),
    requireResolvedLocation: (label: string, coords: { lat: number; lng: number } | null) => {
      if (!coords) throw new Error('Choose an address from the list or use your current location.')
      return { label, coords }
    },
    getMapUrl: () => 'https://maps.example/test',
  },
}))
vi.mock('../ui/MapPinPicker', () => ({ default: () => <div data-testid="pin-map" /> }))

beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState({ activeModal: 'locationConfirm', userLocationLabel: '', userCoords: null, pendingReturnModal: null })
})
afterEach(() => cleanup())

describe('location sheet (F1)', () => {
  it('is the same bottom sheet as every other one, with one primary action in the footer', () => {
    render(<LocationConfirmModal />)
    const sheet = screen.getByRole('dialog', { name: 'Where do you need help?' })
    expect(sheet.className).toContain('ui-sheet')
    const confirm = within(sheet).getByRole('button', { name: 'Confirm location' }) as HTMLButtonElement
    expect(confirm.closest('.ui-sheet__footer')).toBeTruthy()
    expect(confirm.disabled).toBe(true)
  })

  it('only confirms a real place: typed text alone is not enough; a chosen suggestion is', async () => {
    vi.mocked(locationService.searchAddressSuggestions).mockResolvedValue([{ id: 's1', label: '500 Elm St, Denton, TX', lat: 33.21, lng: -97.13 }] as never)
    render(<LocationConfirmModal />)
    const sheet = screen.getByRole('dialog')
    fireEvent.change(within(sheet).getByLabelText('Search address'), { target: { value: '500 Elm' } })
    expect((within(sheet).getByRole('button', { name: 'Confirm location' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(await within(sheet).findByRole('button', { name: /500 Elm St, Denton, TX/ }, { timeout: 2000 }))
    const confirm = within(sheet).getByRole('button', { name: 'Confirm location' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    expect(useAppStore.getState().userLocationLabel).toBe('500 Elm St, Denton, TX')
    expect(useAppStore.getState().userCoords).toEqual({ lat: 33.21, lng: -97.13 })
    expect(useAppStore.getState().activeModal).toBeNull()
  })

  it('says plainly when location permission is off', async () => {
    vi.mocked(locationService.getCurrentLocationSelection).mockRejectedValue(new Error('Location permission denied'))
    render(<LocationConfirmModal />)
    fireEvent.click(screen.getByRole('button', { name: /use my current location/i }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/permission/i)
  })
})
