import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import AdminApp from './AdminApp'
import { adminApi } from './api'
import type { DriverDetail, DriverSummary, ReportDetail, ReportSummary } from './types'
import { REPORT_ACTIONS } from './Reports'
import { seriousA11yViolations } from '../../src/test/axe'

vi.mock('./api', () => ({
  adminApi: {
    currentAdmin: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(async () => {}),
    onSessionEnded: vi.fn(),
    mfaState: vi.fn(),
    startEnrollment: vi.fn(),
    verifyCode: vi.fn(),
    onMfaRequired: vi.fn(),
    listDrivers: vi.fn(),
    getDriver: vi.fn(),
    reviewDocument: vi.fn(async () => ({})),
    decide: vi.fn(async () => ({})),
    listReports: vi.fn(),
    getReport: vi.fn(),
    updateReport: vi.fn(),
    getReportChat: vi.fn(),
  },
}))

const api = vi.mocked(adminApi)
const admin = { id: 'admin-1', firstName: 'Zach', lastName: 'Admin', email: 'zach@aid.test', role: 'admin' as const }
const summary: DriverSummary = {
  id: 'driver-1', firstName: 'Dana', lastName: 'Driver', email: 'dana@aid.test', phone: '+12145550101', accountStatus: 'active',
  verificationStatus: 'under_review', submittedAt: '2026-10-21T10:00:00Z', reviewedAt: null, credentialsValidUntil: null,
  isOnline: false, pendingDocuments: 4, createdAt: '2026-10-20T10:00:00Z',
}
const second: DriverSummary = { ...summary, id: 'driver-2', firstName: 'Sam', lastName: 'Second', email: 'sam@aid.test', submittedAt: '2026-10-21T11:00:00Z' }
const verifiedSummary: DriverSummary = { ...summary, id: 'driver-3', firstName: 'Vera', lastName: 'Verified', email: 'vera@aid.test', verificationStatus: 'verified', pendingDocuments: 0, credentialsValidUntil: '2099-01-01' }
const safetyReport: ReportSummary = {
  id: 'rep-1', reporterRole: 'customer', reporterName: 'Casey Customer', reporterEmail: 'casey@aid.test', category: 'safety', categoryLabel: 'Safety concern',
  isSafety: true, message: 'Driver was speeding with my car on the hook', status: 'open', booking: { id: 'job-1', serviceName: 'Towing', status: 'completed' },
  fromJobIssue: false, createdAt: '2026-10-22T09:00:00Z', updatedAt: null, resolvedAt: null,
}
const appReport: ReportSummary = { ...safetyReport, id: 'rep-2', reporterRole: 'driver', reporterName: 'Dana Driver', category: 'app_problem', categoryLabel: 'App problem', isSafety: false, message: 'Map froze', status: 'in_review', booking: null }
function reportDetail(extra: Partial<ReportDetail> = {}): ReportDetail {
  return {
    ...safetyReport,
    reporter: { id: 'customer-1', name: 'Casey Customer', email: 'casey@aid.test', phone: '+1 214 555 0100', role: 'customer', otherReports: 0 },
    resolvedBy: null,
    booking: {
      id: 'job-1', serviceName: 'Towing', status: 'completed', statusWhenReported: 'in_progress', address: '100 Main St, Dallas', dropoffAddress: '200 Elm St, Dallas',
      price: 95, createdAt: '2026-10-22T08:00:00Z', acceptedAt: null, completedAt: null, cancelledAt: null, expiredAt: null,
      customer: { id: 'customer-1', name: 'Casey Customer', email: 'casey@aid.test', phone: '+1 214 555 0100' },
      driver: { id: 'driver-1', name: 'Dana Driver', email: 'dana@aid.test', phone: '' },
    },
    events: [],
    ...extra,
  }
}
const ALL = ['drivers_license', 'identification', 'insurance', 'vehicle_registration'] as const

function detail(extra: Partial<DriverDetail> = {}, docStatus: 'pending' | 'approved' = 'pending'): DriverDetail {
  return {
    driver: { ...summary, reviewNotes: null, rating: null, ratingCount: 0, totalJobs: 0, status: 'under_review' },
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
  api.mfaState.mockResolvedValue({ step: 'done' })
  api.listDrivers.mockImplementation(async (filter) => (filter === 'all' ? [summary, second, verifiedSummary] : filter === 'verified' ? [verifiedSummary] : [summary, second]))
  api.getDriver.mockResolvedValue(detail())
  api.listReports.mockImplementation(async (filter) => ({ reports: filter === 'resolved' ? [] : [safetyReport, appReport], counts: { open: 1, in_review: 1, resolved: 0, safetyActive: 1 } }))
  api.getReport.mockResolvedValue(reportDetail())
  api.getReportChat.mockResolvedValue({ bookingId: 'booking-9', messages: [], blocks: [] })
  api.updateReport.mockImplementation(async (_id, change) => reportDetail({ status: change.status || 'open', events: change.note ? [{ id: 'e2', action: 'note_added', fromStatus: null, toStatus: null, note: change.note, actor: { id: 'admin-1', name: 'Zach Admin', role: 'admin' }, createdAt: '2026-10-22T10:00:00Z' }] : [] }))
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

  it('shows queue counts and switches filters', async () => {
    render(<AdminApp />)
    expect(await screen.findByRole('button', { name: /dana driver/i })).toBeTruthy()
    expect(api.listDrivers).toHaveBeenCalledWith('needs_review')
    const needsReview = await screen.findByRole('tab', { name: /needs review/i })
    await waitFor(() => expect(needsReview.textContent).toContain('2'))
    fireEvent.click(screen.getByRole('tab', { name: /^verified/i }))
    await waitFor(() => expect(api.listDrivers).toHaveBeenCalledWith('verified'))
    expect(await screen.findByRole('button', { name: /vera verified/i })).toBeTruthy()
  })

  it('searches the queue by name or email', async () => {
    render(<AdminApp />)
    await screen.findByRole('button', { name: /dana driver/i })
    fireEvent.change(screen.getByRole('searchbox', { name: /search drivers/i }), { target: { value: 'sam@' } })
    expect(screen.queryByRole('button', { name: /dana driver/i })).toBeNull()
    expect(screen.getByRole('button', { name: /sam second/i })).toBeTruthy()
  })

  it('B15: shows the driver\'s true average and recent low ratings with their private notes', async () => {
    api.getDriver.mockResolvedValue(detail({
      ratings: { average: 3.5, count: 2, lowRatingMaxStars: 2, recentLow: [
        { bookingId: 'b9', stars: 1, comment: 'Scratched my bumper', tags: [], serviceName: 'Towing', raterFirstName: 'Casey', createdAt: '2026-10-21T10:00:00Z' },
      ] },
    }))
    const panel = await openDriver()
    expect(within(panel).getByRole('heading', { name: 'Customer ratings' })).toBeTruthy()
    expect(within(panel).getByText('3.50')).toBeTruthy()
    expect(within(panel).getByText(/average from 2 ratings/)).toBeTruthy()
    expect(within(panel).getByLabelText('1 out of 5 stars')).toBeTruthy()
    expect(within(panel).getByText('“Scratched my bumper”')).toBeTruthy()
  })

  it('B15: says when a driver has no ratings yet', async () => {
    api.getDriver.mockResolvedValue(detail({ ratings: { average: null, count: 0, lowRatingMaxStars: 2, recentLow: [] } }))
    const panel = await openDriver()
    expect(within(panel).getByText('No ratings yet.')).toBeTruthy()
  })

  it('shows review progress and approves a document', async () => {
    const panel = await openDriver()
    expect(within(panel).getByText(/0 of 4 approved/i)).toBeTruthy()
    const license = within(panel).getByRole('article', { name: /driver's license/i })
    fireEvent.click(within(license).getByRole('button', { name: /^approve$/i }))
    await waitFor(() => expect(api.reviewDocument).toHaveBeenCalledWith('drivers_license-doc', 'approve', undefined))
    await waitFor(() => expect(api.getDriver).toHaveBeenCalledTimes(2))
  })

  it('requires a reason to reject a document and offers common reasons', async () => {
    const panel = await openDriver()
    const insurance = within(panel).getByRole('article', { name: /insurance/i })
    fireEvent.click(within(insurance).getByRole('button', { name: /^reject$/i }))
    const confirm = within(insurance).getByRole('button', { name: /confirm rejection/i }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.click(within(insurance).getByRole('button', { name: /business use/i }))
    expect((within(insurance).getByLabelText(/reason/i) as HTMLTextAreaElement).value).toMatch(/business use/i)
    fireEvent.change(within(insurance).getByLabelText(/reason/i), { target: { value: 'Personal-use policy only' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(api.reviewDocument).toHaveBeenCalledWith('insurance-doc', 'reject', 'Personal-use policy only'))
  })

  it('opens a document preview larger', async () => {
    const panel = await openDriver()
    const license = within(panel).getByRole('article', { name: /driver's license/i })
    fireEvent.click(within(license).getByRole('button', { name: /enlarge/i }))
    const viewer = await screen.findByRole('dialog', { name: /driver's license/i })
    expect(within(viewer).getByRole('img')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('blocks verification until every document is approved, then verifies and confirms', async () => {
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
    expect((await screen.findByRole('status')).textContent).toMatch(/dana driver.*verified/i)
  })

  it('requires a reason to suspend a verified driver', async () => {
    const verified = detail({}, 'approved')
    verified.driver = { ...verified.driver, verificationStatus: 'verified', status: 'verified' }
    api.getDriver.mockResolvedValue(verified)
    const panel = await openDriver()
    expect(within(panel).queryByRole('button', { name: /verify driver/i })).toBeNull()
    fireEvent.click(within(panel).getByRole('button', { name: /^suspend$/i }))
    const dialog = await screen.findByRole('dialog', { name: /suspend/i })
    const confirm = within(dialog).getByRole('button', { name: /confirm suspend/i }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.change(within(dialog).getByLabelText(/reason/i), { target: { value: 'Customer safety complaint' } })
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

  it('moves on to the next driver and back to the queue', async () => {
    const panel = await openDriver()
    fireEvent.click(within(panel).getByRole('button', { name: /next driver/i }))
    await waitFor(() => expect(api.getDriver).toHaveBeenLastCalledWith('driver-2'))
    fireEvent.click(screen.getByRole('button', { name: /back to queue/i }))
    expect(await screen.findByRole('button', { name: /dana driver/i })).toBeTruthy()
  })
})

describe('E5: two-step sign-in for admins (authenticator app)', () => {
  const enrollment = { factorId: 'factor-1', qrCode: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"/>', secret: 'JBSWY3DPEHPK3PXPJBSWY3DP', uri: 'otpauth://totp/AID%20Admin:zach@aid.test?secret=JBSWY3DPEHPK3PXPJBSWY3DP' }

  async function signInWithPassword() {
    fireEvent.change(await screen.findByLabelText(/email/i), { target: { value: 'zach@aid.test' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret-password' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
  }

  it('first sign-in: no authenticator yet → QR code + setup key; a wrong code is refused; the right one opens the dashboard', async () => {
    api.currentAdmin.mockResolvedValue(null)
    api.signIn.mockResolvedValue(admin)
    api.mfaState.mockResolvedValue({ step: 'enroll' })
    api.startEnrollment.mockResolvedValue(enrollment)
    api.verifyCode.mockRejectedValueOnce(new Error("That code didn't work. Codes change every 30 seconds — enter the one your app shows now.")).mockResolvedValueOnce(undefined)
    render(<AdminApp />)
    await signInWithPassword()

    expect(await screen.findByRole('heading', { name: /set up two-step sign-in/i })).toBeTruthy()
    expect((await screen.findByAltText(/qr code/i)).getAttribute('src')).toBe(enrollment.qrCode)
    expect(screen.getByLabelText(/setup key/i).textContent).toBe('JBSW Y3DP EHPK 3PXP JBSW Y3DP')
    expect(api.listDrivers).not.toHaveBeenCalled()

    const code = screen.getByLabelText(/6-digit code/i)
    fireEvent.change(code, { target: { value: '12a345' } })
    expect((code as HTMLInputElement).value).toBe('12345')
    fireEvent.click(screen.getByRole('button', { name: /turn on two-step sign-in/i }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/enter the 6-digit code/i)
    expect(api.verifyCode).not.toHaveBeenCalled()

    fireEvent.change(code, { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: /turn on two-step sign-in/i }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/didn't work/i)
    expect(api.listDrivers).not.toHaveBeenCalled()

    fireEvent.change(code, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /turn on two-step sign-in/i }))
    await screen.findByRole('button', { name: /dana driver/i })
    expect(api.verifyCode).toHaveBeenLastCalledWith('factor-1', '123456')
  })

  it('later sign-ins: asks for the code (no QR), shows rate-limit messages, then opens the dashboard', async () => {
    api.mfaState.mockResolvedValue({ step: 'challenge', factorId: 'factor-9' })
    api.verifyCode.mockRejectedValueOnce(new Error('Too many attempts. Wait a minute, then try again with the current code.')).mockResolvedValueOnce(undefined)
    render(<AdminApp />)
    expect(await screen.findByRole('heading', { name: /enter your code/i })).toBeTruthy()
    expect(screen.queryByAltText(/qr code/i)).toBeNull()
    expect(api.startEnrollment).not.toHaveBeenCalled()
    expect(screen.getByText(/lost your phone/i)).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/6-digit code/i), { target: { value: '654321' } })
    fireEvent.click(screen.getByRole('button', { name: /verify and continue/i }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/too many attempts/i)
    fireEvent.change(screen.getByLabelText(/6-digit code/i), { target: { value: '654321' } })
    fireEvent.click(screen.getByRole('button', { name: /verify and continue/i }))
    await screen.findByRole('button', { name: /dana driver/i })
    expect(api.verifyCode).toHaveBeenLastCalledWith('factor-9', '654321')
  })

  it('sign out from the code screen returns to sign-in', async () => {
    api.mfaState.mockResolvedValue({ step: 'challenge', factorId: 'factor-9' })
    render(<AdminApp />)
    fireEvent.click(await screen.findByRole('button', { name: /sign out/i }))
    expect(api.signOut).toHaveBeenCalled()
    expect(await screen.findByLabelText(/email/i)).toBeTruthy()
  })

  it('if set-up cannot start, says so with Try again', async () => {
    api.mfaState.mockResolvedValue({ step: 'enroll' })
    api.startEnrollment.mockRejectedValueOnce(new Error('Authenticator apps are turned off for this AID project.')).mockResolvedValueOnce(enrollment)
    render(<AdminApp />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/turned off/i)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByAltText(/qr code/i)).toBeTruthy()
  })

  it('when the server answers mfa_required, the site goes back to the code screen', async () => {
    render(<AdminApp />)
    await screen.findByRole('button', { name: /dana driver/i })
    const calls = api.onMfaRequired.mock.calls
    const listener = calls[calls.length - 1]?.[0]
    expect(listener).toBeTypeOf('function')
    api.mfaState.mockResolvedValue({ step: 'challenge', factorId: 'factor-9' })
    listener!()
    expect(await screen.findByRole('heading', { name: /enter your code/i })).toBeTruthy()
  })

  it('the set-up and code screens have no serious axe violations', async () => {
    document.documentElement.lang = 'en'
    document.title = 'AID Admin'
    api.mfaState.mockResolvedValue({ step: 'enroll' })
    api.startEnrollment.mockResolvedValue(enrollment)
    const first = render(<AdminApp />)
    await screen.findByAltText(/qr code/i)
    expect(await seriousA11yViolations()).toEqual([])
    first.unmount()
    api.mfaState.mockResolvedValue({ step: 'challenge', factorId: 'factor-9' })
    render(<AdminApp />)
    await screen.findByRole('heading', { name: /enter your code/i })
    expect(await seriousA11yViolations()).toEqual([])
  })
})

describe('AID admin reports inbox (B18)', () => {
  async function openInbox() {
    render(<AdminApp />)
    fireEvent.click(await screen.findByRole('button', { name: /^reports/i }))
    return screen.findByRole('heading', { name: 'Reports' })
  }

  it('shows the count of reports needing attention in the sidebar and highlights safety reports', async () => {
    render(<AdminApp />)
    const nav = await screen.findByRole('button', { name: /^reports/i })
    await waitFor(() => expect(nav.textContent).toContain('2'))
    fireEvent.click(nav)
    expect(await screen.findByText(/1 safety report not yet resolved/)).toBeTruthy()
    const safetyRow = (await screen.findByRole('button', { name: /open safety concern report from casey customer/i })).closest('tr')!
    expect(safetyRow.className).toContain('row--safety')
    expect(within(safetyRow).getByText('Driver was speeding with my car on the hook')).toBeTruthy()
    const appRow = screen.getByRole('button', { name: /open app problem report from dana driver/i }).closest('tr')!
    expect(appRow.className).not.toContain('row--safety')
    expect(api.listReports).toHaveBeenCalledWith('active', '')
  })

  it('filters by status and category', async () => {
    await openInbox()
    fireEvent.click(screen.getByRole('tab', { name: /^resolved/i }))
    await waitFor(() => expect(api.listReports).toHaveBeenCalledWith('resolved', ''))
    expect(await screen.findByText('No reports here')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'safety' } })
    await waitFor(() => expect(api.listReports).toHaveBeenCalledWith('resolved', 'safety'))
  })

  it('opens a report with the linked job and both parties, changes status and adds an internal note', async () => {
    await openInbox()
    fireEvent.click(await screen.findByRole('button', { name: /open safety concern report/i }))
    const view = await screen.findByRole('region', { name: 'Safety concern' })
    expect(api.getReport).toHaveBeenCalledWith('rep-1')
    expect(within(view).getByText('100 Main St, Dallas')).toBeTruthy()
    expect(within(view).getAllByText('Dana Driver').length).toBeGreaterThan(0)
    expect(within(view).getByText('In service')).toBeTruthy()
    expect(within(view).getByText(/does not contact emergency services/)).toBeTruthy()
    // Only the moves the server allows from "open".
    expect(within(view).getByRole('button', { name: 'Start review' })).toBeTruthy()
    expect(within(view).queryByRole('button', { name: 'Reopen' })).toBeNull()
    fireEvent.click(within(view).getByRole('button', { name: 'Start review' }))
    await waitFor(() => expect(api.updateReport).toHaveBeenCalledWith('rep-1', { status: 'in_review' }))
    expect(await within(view).findByRole('button', { name: 'Move back to open' })).toBeTruthy()
    const add = within(view).getByRole('button', { name: /add note/i }) as HTMLButtonElement
    expect(add.disabled).toBe(true)
    fireEvent.change(within(view).getByLabelText(/internal note/i), { target: { value: 'Called the customer' } })
    fireEvent.click(add)
    await waitFor(() => expect(api.updateReport).toHaveBeenLastCalledWith('rep-1', { note: 'Called the customer' }))
    expect(await within(view).findByText('Called the customer')).toBeTruthy()
    expect((await screen.findByRole('status')).textContent).toMatch(/note added/i)
  })

  it('B12: shows the chat of the reported job, with who sent what and any block', async () => {
    api.getReportChat.mockResolvedValueOnce({
      bookingId: 'booking-9',
      messages: [
        { id: 'm1', senderRole: 'customer', senderName: 'Casey Customer', body: 'Please slow down', createdAt: '2026-10-22T09:00:00Z', readAt: '2026-10-22T09:01:00Z' },
        { id: 'm2', senderRole: 'driver', senderName: 'Dana Driver', body: 'Relax', createdAt: '2026-10-22T09:02:00Z', readAt: null },
      ],
      blocks: [{ blockerRole: 'customer', blockerName: 'Casey Customer', sameJob: true, createdAt: '2026-10-22T09:05:00Z' }],
    })
    await openInbox()
    fireEvent.click(await screen.findByRole('button', { name: /open safety concern report/i }))
    const view = await screen.findByRole('region', { name: 'Safety concern' })
    const thread = await within(view).findByRole('list', { name: 'Chat messages' })
    expect(api.getReportChat).toHaveBeenCalledWith('rep-1')
    expect(within(view).getByRole('heading', { name: 'Chat on this job (2)' })).toBeTruthy()
    const items = within(thread).getAllByRole('listitem')
    expect(items[0].textContent).toMatch(/Casey Customer.*\(customer\).*read.*Please slow down/)
    expect(items[1].textContent).toMatch(/Dana Driver.*\(driver\).*Relax/)
    expect(within(view).getByText(/blocked the other person on this job/)).toBeTruthy()
  })

  it('shows the server error when an update is refused', async () => {
    api.updateReport.mockRejectedValueOnce(new Error('A report that is resolved cannot be moved to open'))
    await openInbox()
    fireEvent.click(await screen.findByRole('button', { name: /open safety concern report/i }))
    const view = await screen.findByRole('region', { name: 'Safety concern' })
    fireEvent.click(within(view).getByRole('button', { name: 'Resolve' }))
    expect((await within(view).findByRole('alert')).textContent).toMatch(/cannot be moved/)
  })

  it('F4: sign-in, queue, driver review, a decision dialog and the reports inbox have no serious axe violations', async () => {
    document.documentElement.lang = 'en'
    document.title = 'AID Admin'
    api.currentAdmin.mockResolvedValueOnce(null)
    const first = render(<AdminApp />)
    await screen.findByLabelText(/email/i)
    expect(await seriousA11yViolations()).toEqual([])
    first.unmount()

    render(<AdminApp />)
    await screen.findByRole('button', { name: /dana driver/i })
    expect(screen.getByRole('table', { name: /drivers — needs review/i })).toBeTruthy()
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(screen.getByRole('tab', { name: /needs review/i }).id)
    expect(await seriousA11yViolations()).toEqual([])

    // Tabs: arrow keys move and select.
    const needsReview = screen.getByRole('tab', { name: /needs review/i })
    fireEvent.keyDown(needsReview, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: /expiring/i }).getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /expiring/i }))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' })

    fireEvent.click(await screen.findByRole('button', { name: /dana driver/i }))
    const panel = await screen.findByRole('region', { name: /dana driver/i })
    expect(await seriousA11yViolations()).toEqual([])
    const enlarge = within(panel).getAllByRole('button', { name: /^enlarge/i })[0]
    enlarge.focus()
    fireEvent.click(enlarge)
    const dialog = await screen.findByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(await seriousA11yViolations()).toEqual([])
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(enlarge)

    fireEvent.click(screen.getByRole('button', { name: /reports/i }))
    await screen.findByRole('table', { name: /reports/i })
    expect(await seriousA11yViolations()).toEqual([])
  })

  it('F5: the driver queue shows table-shaped loading, then an error with Try again that recovers', async () => {
    const pending: Array<(ok: boolean) => void> = []
    api.listDrivers.mockImplementation(() => new Promise((resolve, reject) => {
      pending.push((ok) => (ok ? resolve([summary, second]) : reject(new Error('Network down'))))
    }))
    render(<AdminApp />)
    expect(await screen.findByRole('status', { name: 'Loading drivers' })).toBeTruthy()
    pending.splice(0).forEach((settle) => settle(false))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Couldn't load drivers/)
    api.listDrivers.mockResolvedValue([summary, second])
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: /dana driver/i })).toBeTruthy()
  })

  it('F5: an empty review queue and an empty report inbox say so honestly', async () => {
    api.listDrivers.mockResolvedValue([])
    api.listReports.mockResolvedValue({ reports: [], counts: { open: 0, in_review: 0, resolved: 0, safetyActive: 0 } })
    render(<AdminApp />)
    expect(await screen.findByText('All caught up')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /reports/i }))
    expect(await screen.findByText('Nothing needs attention')).toBeTruthy()
  })

  it('offers only the status moves the server allows', () => {
    expect(Object.fromEntries(Object.entries(REPORT_ACTIONS).map(([from, actions]) => [from, actions.map((a) => a.to)])))
      .toEqual({ open: ['in_review', 'resolved'], in_review: ['resolved', 'open'], resolved: ['in_review'] })
  })
})
