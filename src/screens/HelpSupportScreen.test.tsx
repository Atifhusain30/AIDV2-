import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import serverSupportSource from '../../server/support.js?raw'
import HelpSupportScreen from './HelpSupportScreen'
import ProfileScreen from './ProfileScreen'
import { apiService } from '../services/api'
import { FAQ, REPORT_CATEGORIES, REPORT_MESSAGE_MAX, REPORTS_PER_HOUR, type SupportReport } from '../lib/support'
import { useAppStore } from '../store/useAppStore'
import { useAuthStore } from '../store/useAuthStore'
import type { Booking } from '../types'

vi.mock('../services/api', () => ({
  apiService: {
    getSupportConfig: vi.fn(), listSupportReports: vi.fn(), createSupportReport: vi.fn(), listBookings: vi.fn(), listVehicles: vi.fn(),
  },
}))

const api = vi.mocked(apiService)
const report = (extra: Partial<SupportReport> = {}): SupportReport => ({
  id: 'r1', category: 'app_problem', categoryLabel: 'App problem', message: 'Map froze on the tracking screen', status: 'in_review',
  booking: null, createdAt: '2026-10-20T10:00:00Z', updatedAt: null, resolvedAt: null, ...extra,
})
const booking = { id: 'b1', service: { id: 'towing', name: 'Towing' }, status: 'completed', createdAt: new Date('2026-10-19T10:00:00Z') } as unknown as Booking

beforeEach(() => {
  vi.clearAllMocks()
  api.getSupportConfig.mockResolvedValue({ success: true, data: { contact: { email: null, phone: null }, messageMaxLength: 2000, reportsPerHour: 10 } })
  api.listSupportReports.mockResolvedValue({ success: true, data: [] })
  api.listBookings.mockResolvedValue({ success: true, data: [booking] })
  api.listVehicles.mockResolvedValue({ success: true, data: [] })
})
afterEach(() => cleanup())

describe('Help & Support (B18)', () => {
  it('mirrors the server categories and limits exactly', () => {
    // Evaluate the server's CommonJS rules module (no imports) to compare with the client mirror.
    const loaded = { exports: {} as Record<string, any> }
    new Function('module', 'exports', serverSupportSource)(loaded, loaded.exports)
    const server = loaded.exports
    for (const role of ['customer', 'driver'] as const) {
      expect(REPORT_CATEGORIES[role]).toEqual(Object.entries(server.CATEGORIES[role]).map(([id, label]) => ({ id, label })))
    }
    expect(REPORT_MESSAGE_MAX).toBe(server.MESSAGE_MAX)
    expect(REPORTS_PER_HOUR).toBe(server.REPORTS_PER_HOUR)
  })

  it('renders the FAQ for each audience, including the 911 answer', async () => {
    render(<HelpSupportScreen audience="customer" onBack={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Help & Support' })).toBeTruthy()
    for (const item of FAQ.customer) expect(screen.getByText(item.q)).toBeTruthy()
    expect(screen.getByText(/Yes — until your driver arrives/)).toBeTruthy()
    expect(screen.getByText(/within 15 minutes/)).toBeTruthy()
    expect(screen.getByText(/AID is not an emergency service/)).toBeTruthy()
    cleanup()
    render(<HelpSupportScreen audience="driver" onBack={() => {}} />)
    expect(screen.getByText('How do I get approved to drive?')).toBeTruthy()
    expect(screen.queryByText('Can I cancel?')).toBeNull()
    expect(await screen.findByText(/No reports yet/)).toBeTruthy()
  })

  it('shows no email or phone unless the server has one configured', async () => {
    render(<HelpSupportScreen audience="customer" onBack={() => {}} />)
    await screen.findByText(/No reports yet/)
    expect(screen.queryByRole('link', { name: /Email support/ })).toBeNull()
    expect(document.querySelector('a[href^="mailto:"]')).toBeNull()
    cleanup()
    api.getSupportConfig.mockResolvedValue({ success: true, data: { contact: { email: 'help@aid.test', phone: null }, messageMaxLength: 2000, reportsPerHour: 10 } })
    render(<HelpSupportScreen audience="customer" onBack={() => {}} />)
    expect((await screen.findByRole('link', { name: /Email support/ })).getAttribute('href')).toBe('mailto:help@aid.test')
    expect(screen.queryByRole('link', { name: /Call support/ })).toBeNull()
  })

  it('lists my reports with their status', async () => {
    api.listSupportReports.mockResolvedValue({ success: true, data: [
      report(),
      report({ id: 'r2', category: 'vehicle_damage', categoryLabel: 'Damage to my vehicle', status: 'resolved', booking: { id: 'b1', serviceName: 'Towing' }, resolvedAt: '2026-10-21T10:00:00Z', message: '' }),
    ] })
    render(<HelpSupportScreen audience="customer" onBack={() => {}} />)
    const list = await screen.findByRole('list', { name: 'My reports' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('In review')).toBeTruthy()
    expect(within(items[0]).getByText('Map froze on the tracking screen')).toBeTruthy()
    expect(within(items[1]).getByText('Resolved')).toBeTruthy()
    expect(within(items[1]).getByText(/Towing job/)).toBeTruthy()
  })

  it('shows placeholders while my reports load (F5)', () => {
    api.listSupportReports.mockReturnValue(new Promise(() => undefined))
    render(<HelpSupportScreen audience="customer" onBack={() => {}} />)
    expect(screen.getByRole('status', { name: 'Loading your reports' })).toBeTruthy()
    expect(screen.queryByText(/No reports yet/)).toBeNull()
  })

  it('says so when reports fail to load, with a retry', async () => {
    api.listSupportReports.mockResolvedValueOnce({ success: false, error: 'Unable to reach AID.' })
    render(<HelpSupportScreen audience="driver" onBack={() => {}} />)
    expect(await screen.findByText('Unable to reach AID.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
    expect(await screen.findByText(/No reports yet/)).toBeTruthy()
  })

  it('validates and sends a general report, optionally about a recent job, then shows it', async () => {
    api.createSupportReport.mockResolvedValue({ success: true, data: report({ status: 'open' }) })
    render(<HelpSupportScreen audience="customer" onBack={() => {}} />)
    await screen.findByText(/No reports yet/)
    fireEvent.click(screen.getByRole('button', { name: /Report a problem/ }))
    const dialog = screen.getByRole('dialog', { name: 'Report a problem' })
    expect(within(dialog).getByText(/Not for emergencies/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }))
    expect(within(dialog).getByText('Choose what the problem is about.')).toBeTruthy()
    expect(within(dialog).getByText('Tell us what happened.')).toBeTruthy()
    expect(api.createSupportReport).not.toHaveBeenCalled()
    // Customer list only (no driver-only categories).
    expect(within(dialog).queryByLabelText('Customer behaviour')).toBeNull()
    fireEvent.click(within(dialog).getByLabelText('Pricing or charge'))
    const job = await within(dialog).findByRole('combobox', { name: /Which job/ })
    expect(within(job).getByRole('option', { name: /Towing · .* · completed/ })).toBeTruthy()
    fireEvent.change(job, { target: { value: 'b1' } })
    const message = within(dialog).getByLabelText(/What happened\?/) as HTMLTextAreaElement
    expect(message.maxLength).toBe(2000)
    fireEvent.change(message, { target: { value: '  Charged twice  ' } })
    expect(within(dialog).getByText(`${'  Charged twice  '.length} / 2000`)).toBeTruthy()
    api.listSupportReports.mockResolvedValue({ success: true, data: [report({ status: 'open', message: 'Charged twice' })] })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }))
    expect(await within(dialog).findByRole('heading', { name: 'Report sent' })).toBeTruthy()
    expect(api.createSupportReport).toHaveBeenCalledWith({ category: 'pricing', message: 'Charged twice', bookingId: 'b1' })
    expect(await screen.findByText('Received')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the server error (e.g. hourly limit) and keeps the form', async () => {
    api.createSupportReport.mockResolvedValue({ success: false, error: "You've sent 10 reports in the last hour." })
    render(<HelpSupportScreen audience="driver" onBack={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Report a problem/ }))
    const dialog = screen.getByRole('dialog', { name: 'Report a problem' })
    fireEvent.click(within(dialog).getByLabelText('Payment or earnings'))
    fireEvent.change(within(dialog).getByLabelText(/What happened\?/), { target: { value: 'Missing payout' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }))
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/10 reports in the last hour/)
    expect(within(dialog).getByRole('button', { name: 'Send report' })).toBeTruthy()
  })

  it('opens from Account → Help & safety (the old empty "Support" header is gone)', async () => {
    useAppStore.setState({ user: null, vehicles: [], activeVehicleId: null, currentScreen: 'profile' })
    useAuthStore.setState({ isAuthenticated: false, user: null, token: null })
    render(<ProfileScreen />)
    expect(screen.queryByRole('heading', { name: 'Support' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Help & safety' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Help & Support/ }))
    // F6: Help & Support is lazy-loaded, so it appears once its code has loaded.
    expect(await screen.findByRole('heading', { name: 'Help & Support' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('heading', { name: 'Account' })).toBeTruthy()
  })
})
