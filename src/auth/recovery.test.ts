import { describe, expect, it, vi } from 'vitest'
import { completeRecoveryFromUrl } from './recovery'

describe('native password recovery callback', () => {
  it('exchanges the PKCE code from the AID recovery URL', async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null })

    await expect(completeRecoveryFromUrl({ exchangeCodeForSession }, 'com.aid.roadside://auth/recovery?code=secure-code')).resolves.toBe(true)
    expect(exchangeCodeForSession).toHaveBeenCalledWith('secure-code')
  })

  it('ignores unrelated app links', async () => {
    const exchangeCodeForSession = vi.fn()

    await expect(completeRecoveryFromUrl({ exchangeCodeForSession }, 'com.aid.roadside://bookings/123')).resolves.toBe(false)
    expect(exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('fails clearly when the recovery callback has no code', async () => {
    await expect(completeRecoveryFromUrl({ exchangeCodeForSession: vi.fn() }, 'com.aid.roadside://auth/recovery')).rejects.toThrow('Password recovery link is invalid or expired.')
  })
})