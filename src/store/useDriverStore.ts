/**
 * Driver Store
 * Manages driver-specific state including online status, requests, and active jobs
 */

import { create } from 'zustand'
import type { ServiceRequest, Booking, Location, DriverDocument, DriverDocumentType, DriverVerification } from '../types'
import type { PickedFile } from '@capawesome/capacitor-file-picker'
import { useAuthStore } from './useAuthStore'
import { apiService } from '../services/api'
import { documentService } from '../services/documents'
import type { SharingStatus } from '../lib/jobLocationSharing'

interface DriverStore {
  // State
  isOnline: boolean
  currentLocation: Location | null
  incomingRequests: ServiceRequest[]
  activeBooking: Booking | null
  documents: DriverDocument[]
  verification: DriverVerification | null
  /** GPS sharing state during an active job (shown on the job screen). */
  locationSharing: SharingStatus
  isLoading: boolean
  error: string | null

  // Actions
  setOnlineStatus: (isOnline: boolean) => Promise<void>
  setCurrentLocation: (location: Location) => void
  setLocationSharing: (status: SharingStatus) => void
  fetchIncomingRequests: () => Promise<void>
  acceptRequest: (requestId: string) => Promise<boolean>
  declineRequest: (requestId: string) => void
  updateJobStatus: (status: Booking['status']) => Promise<boolean>
  fetchActiveBooking: (driverId: string) => Promise<void>
  
  // Document management
  fetchDocuments: () => Promise<void>
  addDocument: (document: DriverDocument) => void
  removeDocument: (documentId: string) => Promise<void>

  // Verification (individual provider onboarding)
  fetchVerification: () => Promise<DriverVerification | null>
  uploadVerificationDocument: (file: PickedFile, type: DriverDocumentType, expiresOn?: string) => Promise<void>
  submitVerification: () => Promise<void>
  
  // Reset
  reset: () => void
}

const initialState = {
  isOnline: false,
  currentLocation: null,
  incomingRequests: [],
  activeBooking: null,
  documents: [],
  verification: null,
  locationSharing: 'off' as SharingStatus,
  isLoading: false,
  error: null
}

/** Keep the signed-in driver's profile in step with the server's review decision. */
function syncDriverProfile(verification: Pick<DriverVerification, 'status' | 'credentialsValidUntil'>) {
  const { user, updateUser } = useAuthStore.getState()
  if (user?.role !== 'driver') return
  updateUser({
    verificationStatus: verification.status,
    isVerified: verification.status === 'verified',
    credentialsValidUntil: verification.credentialsValidUntil,
  })
}

export const useDriverStore = create<DriverStore>((set, get) => ({
  ...initialState,

  // Set online/offline status
  setOnlineStatus: async (isOnline) => {
    const user = useAuthStore.getState().user
    if (!user || user.role !== 'driver') {
      set({ error: 'Driver session required' })
      return
    }
    const result = await apiService.updateDriverOnlineStatus(user.id, isOnline)
    if (!result.success) {
      set({ error: result.error })
      return
    }
    set({ isOnline, error: null })
    
    // If going online, start fetching requests
    if (isOnline) {
      get().fetchIncomingRequests()
    }
  },

  // Update current location
  setCurrentLocation: (location) => {
    set({ currentLocation: location })
  },

  setLocationSharing: (locationSharing) => set({ locationSharing }),

  // Fetch incoming service requests
  fetchIncomingRequests: async () => {
    if (!get().isOnline) return
    
    set({ isLoading: true })
    
    const result = await apiService.getServiceRequests()
    
    if (result.success && result.data) {
      set({ incomingRequests: result.data, isLoading: false })
    } else {
      set({ isLoading: false, error: result.error })
    }
  },

  // Accept a service request
  acceptRequest: async (requestId) => {
    const user = useAuthStore.getState().user
    if (!user || user.role !== 'driver') return false
    
    set({ isLoading: true })
    
    const result = await apiService.acceptServiceRequest(requestId, user.id)
    
    if (result.success && result.data) {
      set({
        activeBooking: result.data,
        incomingRequests: get().incomingRequests.filter(r => r.id !== requestId),
        isLoading: false
      })
      return true
    }
    
    set({ isLoading: false, error: result.error })
    return false
  },

  // Decline a request (just remove from local list)
  declineRequest: (requestId) => {
    set({
      incomingRequests: get().incomingRequests.filter(r => r.id !== requestId)
    })
  },

  // Update current job status
  updateJobStatus: async (status) => {
    const { activeBooking } = get()
    if (!activeBooking) return false
    
    set({ isLoading: true })
    
    const result = await apiService.updateBookingStatus(activeBooking.id, status)
    
    if (result.success && result.data) {
      // If completed, clear active booking
      if (status === 'completed' || status === 'cancelled') {
        set({ activeBooking: null, isLoading: false })
      } else {
        set({ activeBooking: result.data, isLoading: false })
      }
      return true
    }
    
    set({ isLoading: false, error: result.error })
    return false
  },

  // Fetch active booking
  fetchActiveBooking: async (driverId) => {
    const result = await apiService.getDriverActiveBooking(driverId)
    
    if (result.success) {
      set({ activeBooking: result.data || null })
    }
  },

  // Fetch stored documents
  fetchDocuments: async () => {
    try {
      const docs = await documentService.getStoredDocuments()
      set({ documents: docs, error: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unable to load documents' })
    }
  },

  // Add a new document
  addDocument: (document) => {
    set({ documents: [...get().documents, document] })
  },

  // Remove a document
  removeDocument: async (documentId) => {
    try {
      await documentService.deleteStoredDocument(documentId)
      set({ documents: get().documents.filter(d => d.id !== documentId), error: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unable to remove document' })
    }
  },

  fetchVerification: async () => {
    try {
      const verification = await documentService.getVerification()
      set({ verification, documents: verification.documents, error: null })
      syncDriverProfile(verification)
      return verification
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unable to load verification status' })
      return null
    }
  },

  // Errors are thrown so the upload sheet can show them next to the field.
  uploadVerificationDocument: async (file, type, expiresOn) => {
    await documentService.uploadDocument(file, type, expiresOn)
    await get().fetchVerification()
  },

  submitVerification: async () => {
    const result = await documentService.submitVerification()
    await get().fetchVerification()
    syncDriverProfile({ status: result.status, credentialsValidUntil: get().verification?.credentialsValidUntil ?? null })
  },

  // Reset store
  reset: () => set(initialState)
}))

export default useDriverStore
