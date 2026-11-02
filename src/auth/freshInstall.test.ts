import { describe, expect, it, vi } from 'vitest'
import { clearSessionIfFreshInstall, INSTALL_MARKER_KEY } from './freshInstall'
import { PRESERVED_LOCAL_KEYS, wipeLocalUserData } from './deviceData'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    has: (key: string) => data.has(key),
  }
}

describe('fresh install sign-out (E12)', () => {
  it('clears a Keychain sign-in left over from a deleted copy of the app', async () => {
    const storage = memoryStorage()
    const clearSession = vi.fn().mockResolvedValue(undefined)
    expect(await clearSessionIfFreshInstall({ storage, clearSession })).toBe(true)
    expect(clearSession).toHaveBeenCalledTimes(1)
    expect(storage.has(INSTALL_MARKER_KEY)).toBe(true)
  })

  it('keeps the sign-in on every later launch', async () => {
    const storage = memoryStorage({ [INSTALL_MARKER_KEY]: '1' })
    const clearSession = vi.fn().mockResolvedValue(undefined)
    expect(await clearSessionIfFreshInstall({ storage, clearSession })).toBe(false)
    expect(clearSession).not.toHaveBeenCalled()
  })

  it('still marks the install when clearing fails, so it is not retried every launch', async () => {
    const storage = memoryStorage()
    const clearSession = vi.fn().mockRejectedValue(new Error('keychain unavailable'))
    expect(await clearSessionIfFreshInstall({ storage, clearSession })).toBe(true)
    expect(storage.has(INSTALL_MARKER_KEY)).toBe(true)
  })

  it('does nothing when app storage is unavailable', async () => {
    const clearSession = vi.fn()
    expect(await clearSessionIfFreshInstall({ storage: null, clearSession })).toBe(false)
    expect(clearSession).not.toHaveBeenCalled()
  })

  it('survives sign-out, so signing out does not look like a reinstall', () => {
    expect(PRESERVED_LOCAL_KEYS).toContain(INSTALL_MARKER_KEY)
    localStorage.setItem(INSTALL_MARKER_KEY, '1')
    localStorage.setItem('aid-bookings-v1', '{}')
    wipeLocalUserData()
    expect(localStorage.getItem(INSTALL_MARKER_KEY)).toBe('1')
    expect(localStorage.getItem('aid-bookings-v1')).toBeNull()
  })
})
