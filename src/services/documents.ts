/**
 * Document Upload Service
 * Handles file picking and uploading for driver documents (DL, ID, etc.)
 */

import { FilePicker, PickedFile } from '@capawesome/capacitor-file-picker'
import { Capacitor } from '@capacitor/core'
import type { DriverDocument } from '../types'
import { v4 as uuidv4 } from 'uuid'

// API Base URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

// Allowed file types
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'application/pdf']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

// Document type labels
export const DOCUMENT_TYPE_LABELS: Record<DriverDocument['type'], string> = {
  drivers_license: "Driver's License",
  identification: 'Government ID',
  insurance: 'Insurance Card',
  vehicle_registration: 'Vehicle Registration'
}

/**
 * Pick a document file using native file picker
 */
export async function pickDocument(): Promise<PickedFile | null> {
  try {
    const result = await FilePicker.pickFiles({
      readData: true // Read file as base64
    })

    if (result.files && result.files.length > 0) {
      const file = result.files[0]
      
      // Validate file size
      if (file.size && file.size > MAX_FILE_SIZE) {
        throw new Error('File size exceeds 10MB limit')
      }

      // Validate file type
      if (file.mimeType && !ALLOWED_TYPES.includes(file.mimeType)) {
        throw new Error('Invalid file type. Please use JPG, PNG, HEIC, or PDF')
      }

      return file
    }

    return null
  } catch (error) {
    console.error('[Documents] Pick file failed:', error)
    throw error
  }
}

/**
 * Pick an image file (for photos of documents)
 */
export async function pickImage(): Promise<PickedFile | null> {
  try {
    const result = await FilePicker.pickImages({
      readData: true
    })

    if (result.files && result.files.length > 0) {
      const file = result.files[0]
      
      if (file.size && file.size > MAX_FILE_SIZE) {
        throw new Error('Image size exceeds 10MB limit')
      }

      return file
    }

    return null
  } catch (error) {
    console.error('[Documents] Pick image failed:', error)
    throw error
  }
}

/**
 * Upload a document to the backend
 * @param file - Picked file with base64 data
 * @param documentType - Type of document
 * @param driverId - Driver ID
 */
export async function uploadDocument(
  file: PickedFile,
  documentType: DriverDocument['type'],
  driverId: string
): Promise<DriverDocument> {
  try {
    // Prepare form data
    const formData = new FormData()
    
    // Convert base64 to blob if needed
    if (file.data) {
      const blob = base64ToBlob(file.data, file.mimeType || 'application/octet-stream')
      formData.append('file', blob, file.name || `document_${Date.now()}`)
    }
    
    formData.append('type', documentType)
    formData.append('driverId', driverId)

    const response = await fetch(`${API_BASE_URL}/drivers/${driverId}/documents`, {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`)
    }

    const data = await response.json()
    return data.document as DriverDocument
  } catch (error) {
    console.error('[Documents] Upload failed:', error)
    
    // For development/demo - store locally
    if (import.meta.env.DEV) {
      console.warn('[Documents] Using local storage for development')
      return storeDocumentLocally(file, documentType)
    }
    
    throw error
  }
}

/**
 * Store document locally for development/demo
 * In production, this should always go to the backend
 */
export function storeDocumentLocally(
  file: PickedFile,
  documentType: DriverDocument['type']
): DriverDocument {
  const documentId = uuidv4()
  
  // Create a data URL for preview
  const fileUrl = file.data 
    ? `data:${file.mimeType || 'application/octet-stream'};base64,${file.data}`
    : ''

  const document: DriverDocument = {
    id: documentId,
    type: documentType,
    fileUrl,
    fileName: file.name || `${documentType}_${Date.now()}`,
    uploadedAt: new Date(),
    status: 'pending'
  }

  // Store in localStorage
  const storedDocs = localStorage.getItem('driver_documents') || '[]'
  const documents = JSON.parse(storedDocs) as DriverDocument[]
  documents.push(document)
  localStorage.setItem('driver_documents', JSON.stringify(documents))

  return document
}

/**
 * Get all stored documents for a driver
 */
export function getStoredDocuments(driverId?: string): DriverDocument[] {
  const storedDocs = localStorage.getItem('driver_documents') || '[]'
  return JSON.parse(storedDocs) as DriverDocument[]
}

/**
 * Delete a stored document
 */
export function deleteStoredDocument(documentId: string): void {
  const storedDocs = localStorage.getItem('driver_documents') || '[]'
  const documents = JSON.parse(storedDocs) as DriverDocument[]
  const filtered = documents.filter(d => d.id !== documentId)
  localStorage.setItem('driver_documents', JSON.stringify(filtered))
}

/**
 * Convert base64 string to Blob
 */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64)
  const byteNumbers = new Array(byteCharacters.length)
  
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  
  const byteArray = new Uint8Array(byteNumbers)
  return new Blob([byteArray], { type: mimeType })
}

/**
 * Check if file picker is available
 */
export function isFilePickerAvailable(): boolean {
  return Capacitor.isPluginAvailable('FilePicker')
}

/**
 * Get file extension from mime type
 */
export function getExtensionFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/heic': 'heic',
    'application/pdf': 'pdf'
  }
  return map[mimeType] || 'file'
}

/**
 * Validate document completeness for driver onboarding
 */
export function validateDocumentRequirements(
  documents: DriverDocument[]
): { isComplete: boolean; missing: DriverDocument['type'][] } {
  const required: DriverDocument['type'][] = ['drivers_license', 'identification']
  const uploaded = documents.map(d => d.type)
  const missing = required.filter(r => !uploaded.includes(r))
  
  return {
    isComplete: missing.length === 0,
    missing
  }
}

export const documentService = {
  pickDocument,
  pickImage,
  uploadDocument,
  storeDocumentLocally,
  getStoredDocuments,
  deleteStoredDocument,
  isAvailable: isFilePickerAvailable,
  validateRequirements: validateDocumentRequirements,
  DOCUMENT_TYPE_LABELS
}

export default documentService
