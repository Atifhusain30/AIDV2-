import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import AdminApp from './AdminApp'
import { adminApi } from './api'
import type { DriverDetail, DriverSummary } from './types'

vi.mock('./api', () => ({
  adminApi: {
    currentAdmin: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(async () => {}),
    listDrivers: vi.fn(),
    getDriver: vi.fn(),
    reviewDocument: vi.fn(async () => ({})),
    decide: vi.fn(async () => ({})),
  },
}))

const api = vi.mocked(adminApi)
const admin = { id: 'admin-1', firstName: 'Zach', lastName: 'Admin', email: 'zach@aid.test', role: 'admin' as const }
const summary: DriverSummary = {
  id: 'driver-1', firstName: 'Dana', lastName: 'Driver', email: 'dana@aid.test', phone: '+12145550101', accountStatus: 'active',
  verificationStatus: 'under_review', submittedAt: '2026-10-21T10:00:00Z', reviewedAt: null, credentialsValidUntil: null,
  isOnline: false, pendingDocuments: 4, createdAt: '2026-10-20T10:00:00Z',
}
const ALL = ['drivers_license', 'identification', 'insurance', 'vehicle_registration'] as const

function detail(extra: Partial<DriverDetail> = {}, docStatus: 'pending' | 'approved' = 'pending'): DriverDetail {
  return {
    driver: { ...summary, reviewNotes: null, rating: 0, totalJobs: 0, status: 'under_review' },
    documents: ALL.map((type) => ({
      id: `${type}-doc`, type, fileName: `${type}.png`, mimeType: 'image/png', status: docStatus, reviewNotes: null,
      expiresOn: type === 'identification' ? null : '2099-01-31', uploadedAt: '2026-10-21T09:00:00Z', fileUrl: `https://signed.example/${type}`,
    })),
    events: [{ id: 'e1', action: 'submitted', notes: null, documentId: null, actor: { id: 'driver-1', name: 'Dana Driver', role: 'driver' }, createdAt: '2026-10-21T10:00:00Z' }],
    readiness: docStatus === 'approved'
      ? { missing: [], rejected: [], unapproved: [], expired: [], canSubmit: true, canVerify: true, credentialsValidUntil: '2099-01-31' }
      : { missing: [], rejected: [], unapproved: [...ALL], expired: [], canSubmit: true, canVerify: false, credentialsValidUntil: '2099-01-31' },
    ...extra,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  api.currentAdmin.mockResolvedValue(admin)
  api.listDrivers.mockResolvedValue([summary])
  api.getDriver.mockResolvedValue(detail())
})
afterEach(() => cleanup())

async function openDriver() {
  render(<AdminApp />)
  fireEvent.click(await screen.findByRole('button', { name: /dana driver/i }))
  return screen.findByRole('region', { name: /dana driver/i })
}

describe('AID admin review', () => {
  it('shows sign-in when there is no admin session and reports non-admin accounts', async () => {
    api.currentAdmin.mockResolvedValue(null)
    api.signIn.mockRejectedValue(new Error('This account does not have admin access.'))
    render(<AdminApp />)
    fireEvent.change(await screen.findByLabelText(/email/i), { target: { value: 'driver@aid.test' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret-password' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/does not have admin access/)
    expect(api.signIn).toHaveBeenCalledWith('driver@aid.test', 'secret-password')
  })

  it('loads the needs-review queue and switches filters', async () => {
    render(<AdminApp />)
    expect(await screen.findByRole('button', { name: /dana driver/i })).toBeTruthy()
    expect(api.listDrivers).toHaveBeenCalledWith('needs_review')
    fireEvent.click(screen.getByRole('tab', { name: /verified/i }))
    await waitFor(() => expect(api.listDrivers).toHaveBeenCalledWith('verified'))
  })

  it('approves a document', async () => {
    const panel = await openDriver()
    const license = within(panel).getByRole('article', { name: /driver's license/i })
    fireEvent.click(within(license).getByRole('button', { name: /^approve$/i }))
    await waitFor(() => expect(api.reviewDocument).toHaveBeenCalledWith('drivers_license-doc', 'approve', undefined))
    await waitFor(() => expect(api.getDriver).toHaveBeenCalledTimes(2))
  })

  it('requires a reason to reject a document', async () => {
    const panel = await openDriver()
    const insurance = within(panel).getByRole('article', { name: /insurance/i })
    fireEvent.click(within(insurance).getByRole('button', { name: /^reject$/i }))
    const confirm = within(insurance).getByRole('button', { name: /confirm rejection/i }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.change(within(insurance).getByLabelText(/reason/i), { target: { value: 'Personal-use policy only' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(api.reviewDocument).toHaveBeenCalledWith('insurance-doc', 'reject', 'Personal-use policy only'))
  })

  it('blocks verification until every document is approved, then verifies', async () => {
    const panel = await openDriver()
    expect((within(panel).getByRole('button', { name: /verify driver/i }) as HTMLButtonElement).disabled).toBe(true)
    expect(within(panel).getByText(/4 documents not yet approved/i)).toBeTruthy()
    cleanup()

    api.getDriver.mockResolvedValue(detail({}, 'approved'))
    const ready = await openDriver()
    const verify = within(ready).getByRole('button', { name: /verify driver/i }) as HTMLButtonElement
    expect(verify.disabled).toBe(false)
    fireEvent.click(verify)
    await waitFor(() => expect(api.decide).toHaveBeenCalledWith('driver-1', 'verify', undefined))
  })

  it('requires a reason to suspend a verified driver', async () => {
    const verified = detail({}, 'approved')
    verified.driver = { ...verified.driver, verificationStatus: 'verified', status: 'verified' }
    api.getDriver.mockResolvedValue(verified)
    const panel = await openDriver()
    expect(within(panel).queryByRole('button', { name: /verify driver/i })).toBeNull()
    fireEvent.click(within(panel).getByRole('button', { name: /^suspend$/i }))
    const confirm = within(panel).getByRole('button', { name: /confirm suspend/i }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.change(within(panel).getByLabelText(/reason/i), { target: { value: 'Customer safety complaint' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(api.decide).toHaveBeenCalledWith('driver-1', 'suspend', 'Customer safety complaint'))
  })

  it('shows server errors from a decision', async () => {
    api.getDriver.mockResolvedValue(detail({}, 'approved'))
    api.decide.mockRejectedValueOnce(new Error('Every required document must be approved and unexpired'))
    const panel = await openDriver()
    fireEvent.click(within(panel).getByRole('button', { name: /verify driver/i }))
    expect((await within(panel).findByRole('alert')).textContent).toMatch(/must be approved/)
  })
})
