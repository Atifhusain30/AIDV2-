import { FilePicker, type PickedFile } from '@capawesome/capacitor-file-picker'
import { Capacitor } from '@capacitor/core'
import type { DriverDocument } from '../types'
import { supabase } from '../auth/supabase'

const API_BASE_URL = (() => {
  const configured = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '')
  return configured.endsWith('/api') ? configured : `${configured}/api`
})()
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'application/pdf']
const MAX_FILE_SIZE = 10 * 1024 * 1024

export const DOCUMENT_TYPE_LABELS: Record<DriverDocument['type'], string> = {
  drivers_license: "Driver's License",
  identification: 'Government ID',
  insurance: 'Insurance Card',
  vehicle_registration: 'Vehicle Registration',
}

function validateFile(file: PickedFile): PickedFile {
  if (file.size && file.size > MAX_FILE_SIZE) throw new Error('File size exceeds 10MB limit')
  if (file.mimeType && !ALLOWED_TYPES.includes(file.mimeType)) throw new Error('Please use JPG, PNG, HEIC, or PDF')
  return file
}

export async function pickDocument(): Promise<PickedFile | null> {
  const result = await FilePicker.pickFiles({ readData: true })
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

export async function uploadDocument(
  file: PickedFile,
  documentType: DriverDocument['type'],
  _driverId?: string,
): Promise<DriverDocument> {
  if (!file.data) throw new Error('The selected file could not be read')
  const formData = new FormData()
  formData.append('file', base64ToBlob(file.data, file.mimeType || 'application/octet-stream'), file.name || `document-${Date.now()}`)
  formData.append('type', documentType)
  const response = await fetch(`${API_BASE_URL}/drivers/me/documents`, {
    method: 'POST',
    headers: await authHeaders(),
    body: formData,
  })
  if (!response.ok) throw new Error(await responseError(response))
  const data = await response.json() as DriverDocument
  return { ...data, uploadedAt: new Date(data.uploadedAt) }
}

export async function getStoredDocuments(): Promise<DriverDocument[]> {
  const response = await fetch(`${API_BASE_URL}/drivers/me/documents`, { headers: await authHeaders() })
  if (!response.ok) throw new Error(await responseError(response))
  const data = await response.json() as DriverDocument[]
  return data.map((document) => ({ ...document, uploadedAt: new Date(document.uploadedAt) }))
}

export async function deleteStoredDocument(documentId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/drivers/me/documents/${encodeURIComponent(documentId)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  })
  if (!response.ok) throw new Error(await responseError(response))
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
  return new Blob([bytes], { type: mimeType })
}

export function isFilePickerAvailable(): boolean {
  return Capacitor.isPluginAvailable('FilePicker')
}

export function validateDocumentRequirements(documents: DriverDocument[]): { isComplete: boolean; missing: DriverDocument['type'][] } {
  const required: DriverDocument['type'][] = ['drivers_license', 'identification']
  const uploaded = new Set(documents.map((document) => document.type))
  const missing = required.filter((type) => !uploaded.has(type))
  return { isComplete: missing.length === 0, missing }
}

export const documentService = {
  pickDocument,
  pickImage,
  uploadDocument,
  getStoredDocuments,
  deleteStoredDocument,
  isAvailable: isFilePickerAvailable,
  validateRequirements: validateDocumentRequirements,
  DOCUMENT_TYPE_LABELS,
}
export default documentService
