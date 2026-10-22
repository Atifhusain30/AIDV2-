import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { getNotificationPermission, initNotifications } from './notifications'
import { offerAlerts, syncAlertsIfAllowed, useAlertsPrompt } from './alertsPrompt'
import AlertsExplainer from '../components/AlertsExplainer'

vi.mock('./notifications', () => ({ getNotificationPermission: vi.fn(), initNotifications: vi.fn(async () => undefined) }))

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useAlertsPrompt.setState({ audience: null })
})
afterEach(() => cleanup())

describe('contextual notification permission', () => {
  it('app start / sign-in never asks when permission was never answered', async () => {
    vi.mocked(getNotificationPermission).mockResolvedValue('prompt')
    await syncAlertsIfAllowed()
    expect(initNotifications).not.toHaveBeenCalled()
  })

  it('app start only sets up alerts silently when they were already allowed', async () => {
    vi.mocked(getNotificationPermission).mockResolvedValue('granted')
    await syncAlertsIfAllowed()
    expect(initNotifications).toHaveBeenCalledTimes(1)
  })

  it('after the first request: explainer first, the system prompt only on "Turn on alerts"', async () => {
    vi.mocked(getNotificationPermission).mockResolvedValue('prompt')
    render(<AlertsExplainer />)
    await act(async () => { await offerAlerts('customer') })
    expect(screen.getByRole('dialog', { name: 'Get alerts when your driver is on the way' })).toBeTruthy()
    expect(initNotifications).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Turn on alerts' }))
    expect(initNotifications).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('"Not now" never shows the system prompt and the explainer is not offered again', async () => {
    vi.mocked(getNotificationPermission).mockResolvedValue('prompt')
    render(<AlertsExplainer />)
    await act(async () => { await offerAlerts('driver') })
    expect(screen.getByRole('dialog', { name: 'Get alerts about your jobs' })).toBeTruthy()
    const notNow = screen.getAllByRole('button', { name: 'Not now' })
    fireEvent.click(notNow[notNow.length - 1])
    expect(initNotifications).not.toHaveBeenCalled()
    await act(async () => { await offerAlerts('driver') })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not nag someone who already said no in iOS settings', async () => {
    vi.mocked(getNotificationPermission).mockResolvedValue('denied')
    render(<AlertsExplainer />)
    await act(async () => { await offerAlerts('customer') })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(initNotifications).not.toHaveBeenCalled()
  })
})
