import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCurrentPosition } from '../lib/geolocation'
import { reverseGeocode } from '../lib/geocoding'
import { getCurrentLocationSelection, requireResolvedLocation } from './locationService'

vi.mock('../lib/geolocation', () => ({
  getCurrentPosition: vi.fn(),
  requestLocationPermission: vi.fn(),
  getMapsUrl: vi.fn(),
}))

vi.mock('../lib/geocoding', () => ({
  reverseGeocode: vi.fn(),
  searchAddresses: vi.fn(),
}))

describe('resolved booking locations', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns real GPS coordinates with a reverse-geocoded label', async () => {
    vi.mocked(getCurrentPosition).mockResolvedValue({ lat: 32.781, lng: -96.799, accuracy: 8 })
    vi.mocked(reverseGeocode).mockResolvedValue({ label: '100 Main Street, Dallas, TX' })

    await expect(getCurrentLocationSelection()).resolves.toEqual({
      label: '100 Main Street, Dallas, TX',
      coords: { lat: 32.781, lng: -96.799, accuracy: 8 },
    })
  })

  it('rejects typed labels that were never resolved to coordinates', () => {
    expect(() => requireResolvedLocation('100 Main Street', null)).toThrow('Select an address suggestion or use your current location.')
  })

  it('accepts valid resolved coordinates', () => {
    expect(requireResolvedLocation('100 Main Street', { lat: 32.781, lng: -96.799 })).toEqual({
      label: '100 Main Street',
      coords: { lat: 32.781, lng: -96.799 },
    })
  })
})
