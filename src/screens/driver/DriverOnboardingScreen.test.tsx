import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import DriverOnboardingScreen from './DriverOnboardingScreen'
import { useDriverStore } from '../../store/useDriverStore'
import { useAuthStore } from '../../store/useAuthStore'
import type { DriverDocument, DriverVerification } from '../../types'

const picked = { data: 'iVBORw0KGgo=', mimeType: 'image/png', name: 'card.png', size: 8 }
vi.mock('../../services/documents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/documents')>()
  return {
    ...actual,
    documentService: { ...actual.documentService, pickImage: vi.fn(async () => picked), pickDocument: vi.fn(async () => null) },
  }
})

const ALL = ['drivers_license', 'identification', 'insurance', 'vehicle_registration'] as const

function doc(type: DriverDocument['type'], extra: Partial<DriverDocument> = {}): DriverDocument {
  return { id: `${type}-1`, type, fileName: `${type}.png`, status: 'pending', uploadedAt: new Date('2026-10-01'), expiresOn: type === 'identification' ? null : '2099-01-31', ...extra }
}

function verification(extra: Partial<DriverVerification> = {}): DriverVerification {
  return {
    status: 'pending', reviewNotes: null, submittedAt: null, reviewedAt: null, credentialsValidUntil: null,
    requiredDocuments: [...ALL],
    readiness: { missing: [...ALL], rejected: [], unapproved: [], expired: [], canSubmit: false, canVerify: false, credentialsValidUntil: null },
    documents: [],
    ...extra,
  }
}

const actions = {
  fetchVerification: vi.fn(async () => null),
  uploadVerificationDocument: vi.fn(async () => {}),
  submitVerification: vi.fn(async () => {}),
}

function setVerification(value: DriverVerification) {
  useDriverStore.setState({ verification: value, documents: value.documents, ...actions })
}

beforeEach(() => {
  vi.clearAllMocks()
  setVerification(verification())
})
afterEach(() => cleanup())

describe('driver verification onboarding', () => {
  it('lists all four required documents and blocks submission until they are uploaded', () => {
    render(<DriverOnboardingScreen onComplete={vi.fn()} onOpenVehicle={vi.fn()} />)
    expect(actions.fetchVerification).toHaveBeenCalled()
    for (const label of ["Driver's license", 'Government ID', 'Commercial auto insurance', 'Vehicle registration']) {
      expect(screen.getByRole('button', { name: new RegExp(label, 'i') })).toBeTruthy()
    }
    expect(within(screen.getByRole('region', { name: 'Documents' })).getAllByText('Needed')).toHaveLength(4)
    expect((screen.getByRole('button', { name: /submit for review/i }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/4 documents still needed/i)).toBeTruthy()
  })

  it('offers the vehicle step after documents and shows the saved vehicle', () => {
    const openVehicle = vi.fn()
    useAuthStore.setState({ user: { id: 'driver-1', role: 'driver', vehicle: null } as never })
    const { unmount } = render(<DriverOnboardingScreen onComplete={vi.fn()} onOpenVehicle={openVehicle} />)
    const step = screen.getByRole('button', { name: /Vehicle & equipment.*Needed/ })
    fireEvent.click(step)
    expect(openVehicle).toHaveBeenCalledTimes(1)
    unmount()

    useAuthStore.setState({ user: { id: 'driver-1', role: 'driver', vehicle: { make: 'Ford', model: 'F-550', year: 2021, color: 'White', plate: 'TOW-77', plateState: 'TX', equipmentType: 'wheel_lift' } } as never })
    render(<DriverOnboardingScreen onComplete={vi.fn()} onOpenVehicle={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Vehicle & equipment.*Added/ })).toBeTruthy()
    expect(screen.getByText('2021 White Ford F-550 · TOW-77 (TX) · Wheel-lift tow truck')).toBeTruthy()
  })

  it('requires an expiration date before uploading an expiring document', async () => {
    render(<DriverOnboardingScreen onComplete={vi.fn()} onOpenVehicle={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /commercial auto insurance/i }))
    const dialog = screen.getByRole('dialog', { name: /commercial auto insurance/i })

    fireEvent.click(within(dialog).getByRole('button', { name: /choose photo/i }))
    expect(await within(dialog).findByRole('alert')).toBeTruthy()
    expect(actions.uploadVerificationDocument).not.toHaveBeenCalled()

    fireEvent.change(within(dialog).getByLabelText(/expiration date/i), { target: { value: '2099-01-31' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /choose photo/i }))
    await waitFor(() => expect(actions.uploadVerificationDocument).toHaveBeenCalledWith(picked, 'insurance', '2099-01-31'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('uploads a government ID without asking for an expiration date', async () => {
    render(<DriverOnboardingScreen onComplete={vi.fn()} onOpenVehicle={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /government id/i }))
    const dialog = screen.getByRole('dialog', { name: /government id/i })
    expect(within(dialog).queryByLabelText(/expiration date/i)).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: /choose photo/i }))
    await waitFor(() => expect(actions.uploadVerificationDocument).toHaveBeenCalledWith(picked, 'identification', undefined))
  })

  it('shows the upload error from the server inside the sheet', async () => {
    actions.uploadVerificationDocument.mockRejectedValueOnce(new Error('The uploaded file content is not a valid JPG, PNG, HEIC, or PDF'))
    render(<DriverOnboardingScreen onComplete={vi.fn()} onOpenVehicle={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /government id/i }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /choose photo/i }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/not a valid JPG/)
  })

  it('shows reviewer feedback for a rejected document and the application', () => {
    setVerification(verification({
      status: 'rejected',
      reviewNotes: 'Insurance must cover business use.',
      documents: [doc('drivers_license', { status: 'approved' }), doc('identification', { status: 'approved' }), doc('insurance', { status: 'rejected', reviewNotes: 'Personal policy only' }), doc('vehicle_registration', { status: 'approved' })],
      readiness: { missing: [], rejected: ['insurance'], unapproved: [], expired: [], canSubmit: false, canVerify: false, credentialsValidUntil: null },
    }))
    render(<DriverOnboardingScreen onComplete={vi.fn()} onOpenVehicle={vi.fn()} />)
    expect(screen.getByText('Insurance must cover business use.')).toBeTruthy()
    expect(screen.getByText('Personal policy only')).toBeTruthy()
    expect(screen.getByText('Needs replacement')).toBeTruthy()
    expect(screen.getAllByText('Approved')).toHaveLength(3)
  })

  it('submits a complete application for review', async () => {
    setVerification(verification({
      documents: ALL.map((type) => doc(type)),
      readiness: { missing: [], rejected: [], unapproved: [...ALL], expired: [], canSubmit: true, canVerify: false, credentialsValidUntil: null },
    }))
    render(<DriverOnboardingScreen onComplete={vi.fn()} onOpenVehicle={vi.fn()} />)
    expect(screen.getAllByText('Uploaded')).toHaveLength(4)
    const submit = screen.getByRole('button', { name: /submit for review/i }) as HTMLButtonElement
    expect(submit.disabled).toBe(false)
    fireEvent.click(submit)
    await waitFor(() => expect(actions.submitVerification).toHaveBeenCalledTimes(1))
  })

  it('explains the under-review state without offering to resubmit', () => {
    setVerification(verification({ status: 'under_review', documents: ALL.map((type) => doc(type)), readiness: { missing: [], rejected: [], unapproved: [...ALL], expired: [], canSubmit: true, canVerify: false, credentialsValidUntil: null } }))
    render(<DriverOnboardingScreen onComplete={vi.fn()} onOpenVehicle={vi.fn()} />)
    expect(screen.getByRole('heading', { name: /under review/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /submit for review/i })).toBeNull()
    expect(screen.getAllByText('In review')).toHaveLength(4)
  })

  it('tells a verified driver when their eligibility ends', () => {
    setVerification(verification({ status: 'verified', credentialsValidUntil: '2098-06-30', documents: ALL.map((type) => doc(type, { status: 'approved' })), readiness: { missing: [], rejected: [], unapproved: [], expired: [], canSubmit: true, canVerify: true, credentialsValidUntil: '2098-06-30' } }))
    render(<DriverOnboardingScreen onComplete={vi.fn()} onOpenVehicle={vi.fn()} />)
    expect(screen.getByRole('heading', { name: /you're verified/i })).toBeTruthy()
    expect(screen.getByText(/Jun 30, 2098/)).toBeTruthy()
  })
})

describe('verification loading and error states (F5)', () => {
  it('shows placeholders while the verification loads, then an error with Try again if it fails', async () => {
    let finish: (value: null) => void = () => undefined
    useDriverStore.setState({ verification: null, error: null, ...actions, fetchVerification: vi.fn(() => new Promise<null>((resolve) => { finish = resolve })) })
    render(<DriverOnboardingScreen onComplete={vi.fn()} onOpenVehicle={vi.fn()} />)
    expect(screen.getByRole('status', { name: 'Loading your verification' })).toBeTruthy()
    useDriverStore.setState({ error: 'Unable to reach AID.' })
    finish(null)
    expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn't load your verification.*Unable to reach AID/)
    const retry = vi.fn(async () => { setVerification(verification()); return verification() })
    useDriverStore.setState({ fetchVerification: retry })
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
    expect(await screen.findByRole('heading', { name: 'Become a verified driver' })).toBeTruthy()
  })
})
