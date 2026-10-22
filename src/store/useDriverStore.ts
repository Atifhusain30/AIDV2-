/**
 * Driver Store
 * Manages driver-specific state including online status, requests, and active jobs
 */

import { create } from 'zustand'
import type { ServiceRequest, Booking, Location, DriverDocument, DriverDocumentType, DriverVerification, DriverVehicle } from '../types'
import type { PickedFile } from '@capawesome/capacitor-file-picker'
import { useAuthStore } from './useAuthStore'
import { apiService } from '../services/api'
import { documentService } from '../services/documents'
import type { SharingStatus } from '../lib/jobLocationSharing'
import { isJobOver, REQUEST_EXPIRED_CODE } from '../lib/jobLifecycle'
import { locateDriver, requestDriverLocationPermission, type LocationProblem, type NearbyStatus } from '../lib/nearbyRequests'

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
  /** Whether the server could place the driver for the nearby request list. */
  nearbyStatus: NearbyStatus
  /** Why the phone couldn't give a position on the last refresh (null when it did). */
  locationProblem: LocationProblem | null
  /** Server's service radius in miles (from the last request list). */
  requestRadiusMiles: number | null
  isLoading: boolean
  error: string | null

  // Actions
  setOnlineStatus: (isOnline: boolean) => Promise<void>
  setCurrentLocation: (location: Location) => void
  setLocationSharing: (status: SharingStatus) => void
  fetchIncomingRequests: () => Promise<void>
  /** Ask for location permission again, then refresh the nearby list. */
  retryLocation: () => Promise<void>
  acceptRequest: (requestId: string) => Promise<boolean>
  declineRequest: (requestId: string) => void
  /** `reason` is required by the server when cancelling (see DRIVER_CANCEL_REASONS). */
  updateJobStatus: (status: Booking['status'], reason?: string) => Promise<boolean>
  syncActiveJob: () => Promise<void>
  /**
   * Set when the driver's active job ended from elsewhere: the customer cancelled, or the server
   * released it because AID heard nothing from the driver for too long (bySystem — E4).
   */
  jobEndedNotice: { bookingId: string; serviceName: string; customerName?: string; bySystem?: boolean } | null
  dismissJobEndedNotice: () => void
  fetchActiveBooking: (driverId: string) => Promise<void>
  
  // Document management
  fetchDocuments: () => Promise<void>
  addDocument: (document: DriverDocument) => void
  removeDocument: (documentId: string) => Promise<void>

  // Verification (individual provider onboarding)
  fetchVerification: () => Promise<DriverVerification | null>
  uploadVerificationDocument: (file: PickedFile, type: DriverDocumentType, expiresOn?: string) => Promise<void>
  submitVerification: () => Promise<void>

  /** Save the service vehicle and update the signed-in driver's profile. `field` names a server-rejected field. */
  saveVehicle: (vehicle: DriverVehicle) => Promise<{ ok: true } | { ok: false; error: string; field?: string }>
  
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
  jobEndedNotice: null,
  nearbyStatus: 'idle' as NearbyStatus,
  locationProblem: null,
  requestRadiusMiles: null,
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
    // Offline: drop the list; the server also forgets the driver's position.
    set(isOnline ? { isOnline, error: null } : { isOnline, error: null, incomingRequests: [], nearbyStatus: 'idle', locationProblem: null })

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

  // Fetch nearby requests: one coarse GPS fix per refresh, sent with the request (server filters by
  // radius and sorts nearest first). If no fix, the server may still use the driver's last fresh
  // position; otherwise it answers 'location_required' and the screen asks for location.
  fetchIncomingRequests: async () => {
    if (!get().isOnline) return

    set({ isLoading: true })
    const fix = await locateDriver()
    if (!get().isOnline) return set({ isLoading: false })
    const result = await apiService.getServiceRequests(fix.ok ? { lat: fix.lat, lng: fix.lng } : undefined)

    if (result.success && result.data) {
      const { status, radiusMiles, requests } = result.data
      set({
        incomingRequests: status === 'ok' ? requests : [],
        nearbyStatus: status,
        requestRadiusMiles: radiusMiles,
        locationProblem: fix.ok ? null : fix.problem,
        isLoading: false,
      })
    } else {
      set({ isLoading: false, error: result.error })
    }
  },

  retryLocation: async () => {
    await requestDriverLocationPermission()
    await get().fetchIncomingRequests()
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
    
    // Refused (e.g. the equipment can't do this job, or another driver took it): show the server's
    // message and refresh the list so it matches what the server will let this driver take.
    set({
      isLoading: false, error: result.error || 'Unable to accept this request.',
      // E4: an expired request is gone for good — drop it now rather than waiting for the refresh.
      ...(result.code === REQUEST_EXPIRED_CODE ? { incomingRequests: get().incomingRequests.filter(r => r.id !== requestId) } : {}),
    })
    await get().fetchIncomingRequests()
    return false
  },

  // Decline a request (just remove from local list)
  declineRequest: (requestId) => {
    set({
      incomingRequests: get().incomingRequests.filter(r => r.id !== requestId)
    })
  },

  // Move the job one step (server enforces the order). On rejection, resync with the server so the
  // screen shows the real status — e.g. the customer cancelled a moment earlier.
  updateJobStatus: async (status, reason) => {
    const { activeBooking } = get()
    if (!activeBooking) return false

    set({ isLoading: true, error: null })
    const result = await apiService.updateBookingStatus(activeBooking.id, status, reason)

    if (result.success && result.data) {
      // Completing or cancelling frees the driver: no active job, so GPS sharing stops.
      if (isJobOver(result.data.status)) set({ activeBooking: null, isLoading: false })
      else set({ activeBooking: result.data, isLoading: false })
      return true
    }

    set({ isLoading: false, error: result.error || 'Unable to update this job.' })
    await get().syncActiveJob()
    return false
  },

  // Refresh the active job from the server; if it ended from the customer's side, say so once.
  syncActiveJob: async () => {
    const job = get().activeBooking
    if (!job) return
    const result = await apiService.getBooking(job.id)
    if (!result.success || !result.data || get().activeBooking?.id !== job.id) return
    const latest = result.data
    if (isJobOver(latest.status)) {
      set({
        activeBooking: null,
        error: null,
        jobEndedNotice: latest.status === 'cancelled' && latest.cancelledBy !== 'driver'
          ? {
            bookingId: latest.id, serviceName: latest.service.name, customerName: latest.customer?.firstName,
            ...(latest.cancelledBy === 'system' ? { bySystem: true } : {}),
          }
          : null,
      })
      return
    }
    set({ activeBooking: latest })
  },

  dismissJobEndedNotice: () => set({ jobEndedNotice: null }),

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

  saveVehicle: async (vehicle) => {
    const { user, updateUser } = useAuthStore.getState()
    if (!user || user.role !== 'driver') return { ok: false, error: 'Driver session required' }
    const result = await apiService.updateDriverVehicle(vehicle)
    if (!result.success || !result.data) return { ok: false, error: result.error || 'Unable to save your vehicle. Try again.', field: result.field }
    updateUser({ vehicle: result.data })
    // A saved vehicle clears the "add your vehicle" message from a blocked go-online attempt.
    set({ error: null })
    return { ok: true }
  },

  // Reset store
  reset: () => set(initialState)
}))

export default useDriverStore
