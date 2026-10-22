import { FilePicker, type PickedFile } from '@capawesome/capacitor-file-picker'
import { Capacitor } from '@capacitor/core'
import type { DriverDocument, DriverDocumentType, DriverVerification, VerificationStatus } from '../types'
import { supabase } from '../auth/supabase'

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '')
  return configured.endsWith('/api') ? configured : `${configured}/api`
})()
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'application/pdf']
const MAX_FILE_SIZE = 10 * 1024 * 1024

/** Mirrors server/verification.js — every individual provider needs all four. */
export const DOCUMENT_REQUIREMENTS: Record<DriverDocumentType, { label: string; hint: string; requiresExpiration: boolean }> = {
  drivers_license: { label: "Driver's license", hint: 'Front of a valid, unexpired license. All text readable.', requiresExpiration: true },
  identification: { label: 'Government ID', hint: 'Passport, state ID, or other government photo ID.', requiresExpiration: false },
  insurance: { label: 'Commercial auto insurance', hint: 'Policy page or card that covers business use of your vehicle.', requiresExpiration: true },
  vehicle_registration: { label: 'Vehicle registration', hint: 'Current registration for the vehicle you will drive.', requiresExpiration: true },
}
export const REQUIRED_DOCUMENT_TYPES = Object.keys(DOCUMENT_REQUIREMENTS) as DriverDocumentType[]

export const DOCUMENT_TYPE_LABELS: Record<DriverDocumentType, string> = Object.fromEntries(
  REQUIRED_DOCUMENT_TYPES.map((type) => [type, DOCUMENT_REQUIREMENTS[type].label]),
) as Record<DriverDocumentType, string>

function validateFile(file: PickedFile): PickedFile {
  if (file.size && file.size > MAX_FILE_SIZE) throw new Error('File size exceeds 10MB limit')
  if (file.mimeType && !ALLOWED_TYPES.includes(file.mimeType)) throw new Error('Please use JPG, PNG, HEIC, or PDF')
  return file
}

export async function pickDocument(): Promise<PickedFile | null> {
  const result = await FilePicker.pickFiles({ types: ['application/pdf'], readData: true })
  return result.files?.[0] ? validateFile(result.files[0]) : null
}

export async function pickImage(): Promise<PickedFile | null> {
  const result = await FilePicker.pickImages({ readData: true })
  return result.files?.[0] ? validateFile(result.files[0]) : null
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token) throw new Error('Driver session required')
  return { Authorization: `Bearer ${data.session.access_token}` }
}

async function responseError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: string } | null
  return body?.error || `Request failed (${response.status})`
}

function parseDocument(document: DriverDocument): DriverDocument {
  return { ...document, uploadedAt: new Date(document.uploadedAt) }
}

export async function uploadDocument(file: PickedFile, documentType: DriverDocumentType, expiresOn?: string): Promise<DriverDocument> {
  if (DOCUMENT_REQUIREMENTS[documentType].requiresExpiration && !expiresOn) {
    throw new Error('Enter the expiration date printed on this document.')
  }
  if (!file.data) throw new Error('The selected file could not be read')
  const formData = new FormData()
  formData.append('file', base64ToBlob(file.data, file.mimeType || 'application/octet-stream'), file.name || `document-${Date.now()}`)
  formData.append('type', documentType)
  if (expiresOn) formData.append('expiresOn', expiresOn)
  const response = await fetch(`${API_BASE_URL}/drivers/me/documents`, {
    method: 'POST',
    headers: await authHeaders(),
    body: formData,
  })
  if (!response.ok) throw new Error(await responseError(response))
  return parseDocument(await response.json() as DriverDocument)
}

export async function getStoredDocuments(): Promise<DriverDocument[]> {
  const response = await fetch(`${API_BASE_URL}/drivers/me/documents`, { headers: await authHeaders() })
  if (!response.ok) throw new Error(await responseError(response))
  return (await response.json() as DriverDocument[]).map(parseDocument)
}

export async function deleteStoredDocument(documentId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/drivers/me/documents/${encodeURIComponent(documentId)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  })
  if (!response.ok) throw new Error(await responseError(response))
}

export async function getVerification(): Promise<DriverVerification> {
  const response = await fetch(`${API_BASE_URL}/drivers/me/verification`, { headers: await authHeaders() })
  if (!response.ok) throw new Error(await responseError(response))
  const verification = await response.json() as DriverVerification
  return { ...verification, documents: verification.documents.map(parseDocument) }
}

export async function submitVerification(): Promise<{ status: VerificationStatus }> {
  const response = await fetch(`${API_BASE_URL}/drivers/me/verification/submit`, {
    method: 'POST',
    headers: await authHeaders(),
  })
  if (!response.ok) throw new Error(await responseError(response))
  return response.json()
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
  return new Blob([bytes], { type: mimeType })
}

export function isFilePickerAvailable(): boolean {
  return Capacitor.isPluginAvailable('FilePicker')
}

/** Newest upload per type — older uploads are history only (matches the server). */
export function latestDocumentsByType(documents: DriverDocument[]): Partial<Record<DriverDocumentType, DriverDocument>> {
  const latest: Partial<Record<DriverDocumentType, DriverDocument>> = {}
  for (const document of documents) {
    const current = latest[document.type]
    if (!current || new Date(document.uploadedAt) > new Date(current.uploadedAt)) latest[document.type] = document
  }
  return latest
}

export const documentService = {
  pickDocument,
  pickImage,
  uploadDocument,
  getStoredDocuments,
  deleteStoredDocument,
  getVerification,
  submitVerification,
  isAvailable: isFilePickerAvailable,
  latestDocumentsByType,
  DOCUMENT_TYPE_LABELS,
}
export default documentService
