import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../auth/supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'driver-token' } }, error: null }) } },
}))
vi.mock('@capawesome/capacitor-file-picker', () => ({ FilePicker: { pickFiles: vi.fn(), pickImages: vi.fn() } }))

import { documentService, DOCUMENT_REQUIREMENTS } from './documents'

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('driver document service', () => {
  it('requires the same four documents and expirations as the server', () => {
    expect(Object.keys(DOCUMENT_REQUIREMENTS).sort()).toEqual(['drivers_license', 'identification', 'insurance', 'vehicle_registration'])
    expect(DOCUMENT_REQUIREMENTS.drivers_license.requiresExpiration).toBe(true)
    expect(DOCUMENT_REQUIREMENTS.insurance.requiresExpiration).toBe(true)
    expect(DOCUMENT_REQUIREMENTS.vehicle_registration.requiresExpiration).toBe(true)
    expect(DOCUMENT_REQUIREMENTS.identification.requiresExpiration).toBe(false)
  })

  it('uploads the expiration date with the file', async () => {
    fetchMock.mockResolvedValue(json({ id: 'doc-1', type: 'insurance', fileName: 'card.png', status: 'pending', expiresOn: '2099-01-31', uploadedAt: '2026-10-21T00:00:00Z' }, 201))
    const document = await documentService.uploadDocument({ data: 'iVBORw0KGgo=', mimeType: 'image/png', name: 'card.png', size: 8 } as never, 'insurance', '2099-01-31')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/api\/drivers\/me\/documents$/)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer driver-token')
    const form = init.body as FormData
    expect(form.get('type')).toBe('insurance')
    expect(form.get('expiresOn')).toBe('2099-01-31')
    expect(document.expiresOn).toBe('2099-01-31')
    expect(document.uploadedAt).toBeInstanceOf(Date)
  })

  it('refuses to upload an expiring document without a date', async () => {
    await expect(documentService.uploadDocument({ data: 'AA==', mimeType: 'image/png', name: 'x.png' } as never, 'drivers_license')).rejects.toThrow(/expiration date/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces the server error message on failed uploads', async () => {
    fetchMock.mockResolvedValue(json({ error: 'A future expiration date (YYYY-MM-DD) is required for this document' }, 400))
    await expect(documentService.uploadDocument({ data: 'AA==', mimeType: 'image/png', name: 'x.png' } as never, 'insurance', '2001-01-01'))
      .rejects.toThrow('A future expiration date (YYYY-MM-DD) is required for this document')
  })

  it('reads verification status and submits for review', async () => {
    fetchMock.mockResolvedValueOnce(json({
      status: 'pending', reviewNotes: null, submittedAt: null, reviewedAt: null, credentialsValidUntil: null,
      requiredDocuments: ['drivers_license', 'identification', 'insurance', 'vehicle_registration'],
      readiness: { missing: ['insurance'], rejected: [], unapproved: [], expired: [], canSubmit: false, canVerify: false, credentialsValidUntil: null },
      documents: [{ id: 'd1', type: 'drivers_license', fileName: 'dl.png', status: 'pending', expiresOn: '2099-01-01', uploadedAt: '2026-10-21T00:00:00Z' }],
    }))
    const verification = await documentService.getVerification()
    expect(verification.readiness.missing).toEqual(['insurance'])
    expect(verification.documents[0].uploadedAt).toBeInstanceOf(Date)

    fetchMock.mockResolvedValueOnce(json({ status: 'under_review', reviewNotes: null, submittedAt: '2026-10-21T00:00:00Z', reviewedAt: null, credentialsValidUntil: null }))
    await documentService.submitVerification()
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toMatch(/\/api\/drivers\/me\/verification\/submit$/)
    expect(init.method).toBe('POST')
  })
})
