import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { Booking, ServiceType } from '../types'

// Modal types
export type ModalType = 
  | 'services' 
  | 'towing' 
  | 'ev_charging' 
  | 'detailing' 
  | 'window_tinting'
  | 'search'
  | 'locationConfirm'
  | null

// Geolocation coordinates type
export type GeoCoords = { lat: number; lng: number; accuracy?: number }

// Form data types
export interface ServiceFormData {
  selectedService: ServiceType | null
  problemDescription: string
  vehicleType: 'sedan' | 'suv' | 'truck' | 'van' | 'motorcycle' | null
  photoUrl?: string
  /** Tow destination chosen from address search (real coordinates). */
  dropoff?: { address: string; lat: number; lng: number } | null
}

export interface TowingFormData {
  pickupAddress: string
  pickupCoords: { lat: number; lng: number } | null
  dropoffAddress: string
  dropoffCoords: { lat: number; lng: number } | null
  vehicleType: 'sedan' | 'suv' | 'truck' | 'van' | 'motorcycle' | null
  isDrivable: boolean
  specialRequirements: string
  distance: number
}

export interface EVChargingFormData {
  address: string
  coords: { lat: number; lng: number } | null
  evMake: string
  evModel: string
  batteryType: string
  currentCharge: number
  desiredCharge: number
}

export interface DetailingFormData {
  package: 'basic' | 'standard' | 'premium' | 'ultimate' | null
  vehicleSize: 'compact' | 'sedan' | 'suv' | 'truck' | null
  addOns: string[]
  scheduledDate: string
  scheduledTime: string
  location: 'mobile' | 'dropoff'
}

export interface WindowTintingFormData {
  tintType: 'ceramic' | 'carbon' | 'dyed' | null
  coverage: {
    frontWindshield: boolean
    frontSide: boolean
    rearSide: boolean
    backWindshield: boolean
    sunroof: boolean
  }
  shadeLevel: number
  vehicleMake: string
  vehicleModel: string
  vehicleYear: string
}

// Auth + Profile types
export interface UserProfile {
  id: string
  name: string
  phone: string
  email?: string
}

// User's saved vehicles (persisted in store)
export interface UserVehicle {
  id: string
  make: string
  model: string
  year: number
  color: string
  plate: string
  createdAt: string
}

interface AppState {
  /**
   * E6: whose data this is. Everything persisted here belongs to this account; when a different
   * account (or the same account with a different server role) signs in, it is wiped first.
   */
  ownerId: string | null
  ownerRole: 'customer' | 'driver' | null
  setOwner: (ownerId: string, ownerRole: 'customer' | 'driver') => void
  /** E6: back to a fresh install's state (sign-out, account switch). */
  resetUserData: () => void

  // Auth + User Profile
  isAuthed: boolean
  user: UserProfile | null
  signOut: () => void
  updateUserProfile: (patch: Partial<Omit<UserProfile, 'id'>>) => void
  
  // Vehicles
  vehicles: UserVehicle[]
  activeVehicleId: string | null
  addVehicle: (input: Omit<UserVehicle, 'id' | 'createdAt'>) => void
  updateVehicle: (id: string, patch: Partial<Omit<UserVehicle, 'id' | 'createdAt'>>) => void
  removeVehicle: (id: string) => void
  setActiveVehicle: (id: string) => void
  setVehicles: (vehicles: UserVehicle[]) => void
  
  // Confirmed Location (for bookings)
  userLocationLabel: string              // Human-readable address or "Current location (GPS)"
  userCoords: GeoCoords | null           // Last confirmed GPS coords
  locationConfirmedAt: string | null     // ISO timestamp when location was confirmed
  setUserLocationLabel: (label: string) => void
  setUserCoords: (coords: GeoCoords | null) => void
  confirmLocation: (label: string, coords?: GeoCoords | null) => void
  clearConfirmedLocation: () => void
  
  // Bookings
  activeBooking: Booking | null
  setActiveBooking: (booking: Booking | null) => void
  updateActiveBookingStatus: (status: Booking['status'], updates?: Partial<Booking>) => void
  clearActiveBooking: () => void
  /**
   * Shown once when the server reports the active request ended without the customer doing it here
   * (not persisted): the driver cancelled, no driver accepted in time ('expired'), or the driver
   * stopped responding and the server released the job ('driver_unresponsive').
   */
  endedBookingNotice: {
    bookingId: string; serviceName: string; driverName?: string; byCustomer?: boolean
    reason?: 'expired' | 'driver_unresponsive'
  } | null
  setEndedBookingNotice: (notice: AppState['endedBookingNotice']) => void
  /** Set when the customer tried to request while a request was already active and was taken to it (E4). */
  activeRequestRedirect: boolean
  setActiveRequestRedirect: (value: boolean) => void
  bookingHistory: Booking[]
  addToBookingHistory: (booking: Booking) => void
  updateBookingInHistory: (id: string, updates: Partial<Booking>) => void
  rebookFromHistory: (bookingId: string) => void
  clearBookings: () => void
  
  // Legacy service selection
  selectedService: ServiceType | null
  setSelectedService: (service: ServiceType | null) => void
  isServicesModalOpen: boolean
  setServicesModalOpen: (open: boolean) => void
  
  // Navigation
  currentScreen: 'home' | 'history' | 'chat' | 'garage' | 'profile'
  setCurrentScreen: (screen: 'home' | 'history' | 'chat' | 'garage' | 'profile') => void
  
  // Booking Detail Modal (UI-only, not persisted)
  selectedBookingId: string | null
  openBookingDetail: (id: string) => void
  closeBookingDetail: () => void
  openBookingDetailFromNotification: (bookingId: string) => void
  
  // Receipt Modal (UI-only, not persisted)
  receiptBookingId: string | null
  openReceipt: (id: string) => void
  closeReceipt: () => void
  setTipForBooking: (id: string, tipAmount: number) => void
  
  // Modal Management
  activeModal: ModalType
  setActiveModal: (modal: ModalType) => void
  setActiveModalPreserveStep: (modal: ModalType) => void  // Opens modal without resetting step
  pendingReturnModal: ModalType  // Modal to return to after location confirm
  pendingReturnModalStep: number  // Step to return to
  setPendingReturnModal: (modal: ModalType, step?: number) => void
  modalStep: number
  setModalStep: (step: number) => void
  nextModalStep: () => void
  prevModalStep: () => void
  resetModalStep: () => void
  
  // Form Data
  serviceFormData: ServiceFormData
  setServiceFormData: (data: Partial<ServiceFormData>) => void
  resetServiceFormData: () => void
  
  towingFormData: TowingFormData
  setTowingFormData: (data: Partial<TowingFormData>) => void
  resetTowingFormData: () => void
  
  evChargingFormData: EVChargingFormData
  setEVChargingFormData: (data: Partial<EVChargingFormData>) => void
  resetEVChargingFormData: () => void
  
  detailingFormData: DetailingFormData
  setDetailingFormData: (data: Partial<DetailingFormData>) => void
  resetDetailingFormData: () => void
  
  windowTintingFormData: WindowTintingFormData
  setWindowTintingFormData: (data: Partial<WindowTintingFormData>) => void
  resetWindowTintingFormData: () => void
  
  // Loading States
  isCalculating: boolean
  setIsCalculating: (loading: boolean) => void
  isSubmitting: boolean
  setIsSubmitting: (loading: boolean) => void
  showSuccess: boolean
  setShowSuccess: (show: boolean) => void
  
  // Search
  searchQuery: string
  setSearchQuery: (query: string) => void
}

const initialServiceFormData: ServiceFormData = {
  selectedService: null,
  problemDescription: '',
  vehicleType: null,
}

const initialTowingFormData: TowingFormData = {
  pickupAddress: '',
  pickupCoords: null,
  dropoffAddress: '',
  dropoffCoords: null,
  vehicleType: null,
  isDrivable: false,
  specialRequirements: '',
  distance: 0,
}

const initialEVChargingFormData: EVChargingFormData = {
  address: '',
  coords: null,
  evMake: '',
  evModel: '',
  batteryType: '',
  currentCharge: 20,
  desiredCharge: 80,
}

const initialDetailingFormData: DetailingFormData = {
  package: null,
  vehicleSize: null,
  addOns: [],
  scheduledDate: '',
  scheduledTime: '',
  location: 'mobile',
}

const initialWindowTintingFormData: WindowTintingFormData = {
  tintType: null,
  coverage: {
    frontWindshield: false,
    frontSide: false,
    rearSide: true,
    backWindshield: true,
    sunroof: false,
  },
  shadeLevel: 35,
  vehicleMake: '',
  vehicleModel: '',
  vehicleYear: '',
}

// Helper to safely get storage (handles SSR and private mode)
const getStorage = () => {
  try {
    // Test if localStorage is available
    if (typeof window !== 'undefined' && window.localStorage) {
      const testKey = '__storage_test__'
      window.localStorage.setItem(testKey, testKey)
      window.localStorage.removeItem(testKey)
      return localStorage
    }
  } catch {
    // localStorage not available (SSR, private mode, etc.)
  }
  // Return a no-op storage fallback
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  }
}

/** Every piece of user data in this store at its fresh-install value (E6 reset). */
const initialUserData = () => ({
  ownerId: null,
  ownerRole: null,
  isAuthed: false,
  user: null,
  vehicles: [],
  activeVehicleId: null,
  userLocationLabel: '',
  userCoords: null,
  locationConfirmedAt: null,
  activeBooking: null,
  endedBookingNotice: null,
  activeRequestRedirect: false,
  bookingHistory: [],
  selectedService: null,
  isServicesModalOpen: false,
  currentScreen: 'home' as const,
  selectedBookingId: null,
  receiptBookingId: null,
  activeModal: null,
  pendingReturnModal: null,
  pendingReturnModalStep: 1,
  modalStep: 1,
  serviceFormData: initialServiceFormData,
  towingFormData: initialTowingFormData,
  evChargingFormData: initialEVChargingFormData,
  detailingFormData: initialDetailingFormData,
  windowTintingFormData: initialWindowTintingFormData,
  isCalculating: false,
  isSubmitting: false,
  showSuccess: false,
  searchQuery: '',
})

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ownerId: null,
      ownerRole: null,
      setOwner: (ownerId, ownerRole) => set({ ownerId, ownerRole }),
      resetUserData: () => set(initialUserData()),

      // Auth + User Profile
      isAuthed: false,
      user: null,
      // Store-only reset; the full sign-out (session, GPS, live updates, storage) is src/auth/signOut.ts.
      signOut: () => set(initialUserData()),
      updateUserProfile: (patch) => set((state) => ({
        user: state.user ? { ...state.user, ...patch } : null,
      })),
      
      // Vehicles
      vehicles: [],
      activeVehicleId: null,
      addVehicle: (input) => set((state) => {
        const newVehicle: UserVehicle = {
          ...input,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        }
        const newVehicles = [newVehicle, ...state.vehicles]
        return {
          vehicles: newVehicles,
          // Auto-select first vehicle as active
          activeVehicleId: state.activeVehicleId ?? newVehicle.id,
        }
      }),
      updateVehicle: (id, patch) => set((state) => ({
        vehicles: state.vehicles.map((v) =>
          v.id === id ? { ...v, ...patch } : v
        ),
      })),
      removeVehicle: (id) => set((state) => {
        const newVehicles = state.vehicles.filter((v) => v.id !== id)
        // If removing active vehicle, select first remaining or null
        const newActiveId =
          state.activeVehicleId === id
            ? newVehicles[0]?.id ?? null
            : state.activeVehicleId
        return {
          vehicles: newVehicles,
          activeVehicleId: newActiveId,
        }
      }),
      setActiveVehicle: (id) => set({ activeVehicleId: id }),
      setVehicles: (vehicles) => set((state) => ({
        vehicles,
        activeVehicleId: vehicles.some((vehicle) => vehicle.id === state.activeVehicleId)
          ? state.activeVehicleId
          : vehicles[0]?.id ?? null,
      })),
      
      // Confirmed Location (for bookings)
      userLocationLabel: '',
      userCoords: null,
      locationConfirmedAt: null,
      setUserLocationLabel: (label) => set({ userLocationLabel: label }),
      setUserCoords: (coords) => set({ userCoords: coords }),
      confirmLocation: (label, coords) => set({
        userLocationLabel: label,
        userCoords: coords ?? null,
        locationConfirmedAt: new Date().toISOString(),
      }),
      clearConfirmedLocation: () => set({
        userLocationLabel: '',
        userCoords: null,
        locationConfirmedAt: null,
      }),
      
      // Bookings
      activeBooking: null,
      setActiveBooking: (booking) => set({ activeBooking: booking }),
      updateActiveBookingStatus: (status, updates = {}) => set((state) => {
        if (!state.activeBooking) return state
        const updatedBooking = { ...state.activeBooking, status, ...updates }
        return {
          activeBooking: updatedBooking,
          // Also update the booking in history
          bookingHistory: state.bookingHistory.map(b => 
            b.id === updatedBooking.id ? updatedBooking : b
          )
        }
      }),
      clearActiveBooking: () => set({ activeBooking: null }),
      endedBookingNotice: null,
      setEndedBookingNotice: (endedBookingNotice) => set({ endedBookingNotice }),
      activeRequestRedirect: false,
      setActiveRequestRedirect: (activeRequestRedirect) => set({ activeRequestRedirect }),
      bookingHistory: [],
      addToBookingHistory: (booking) => set((state) => ({
        bookingHistory: [booking, ...state.bookingHistory]
      })),
      updateBookingInHistory: (id, updates) => set((state) => ({
        bookingHistory: state.bookingHistory.map(b => 
          b.id === id ? { ...b, ...updates } : b
        )
      })),
      // "Request again" reopens the request sheet prefilled with the same service (and tow
      // destination); the customer confirms, and the server creates a real booking.
      rebookFromHistory: (bookingId) => set((state) => {
        const oldBooking = state.bookingHistory.find(b => b.id === bookingId)
        if (!oldBooking) return state
        const dropoff = oldBooking.dropoffLocation
        return {
          serviceFormData: {
            ...initialServiceFormData,
            selectedService: oldBooking.service.id,
            dropoff: dropoff && dropoff.address ? { address: dropoff.address, lat: dropoff.lat, lng: dropoff.lng } : null,
          },
          activeModal: 'services',
          modalStep: 1,
          // The request sheet lives on Home, so "Request again" from Activity or a notice opens it there.
          currentScreen: 'home',
        }
      }),
      clearBookings: () => set({ bookingHistory: [], activeBooking: null }),
      
      // Legacy service selection
      selectedService: null,
      setSelectedService: (service) => set({ selectedService: service }),
      isServicesModalOpen: false,
      setServicesModalOpen: (open) => set({ isServicesModalOpen: open }),
      
      // Navigation
      currentScreen: 'home',
      setCurrentScreen: (screen) => set({ currentScreen: screen }),
      
      // Booking Detail Modal (UI-only, not persisted)
      selectedBookingId: null,
      openBookingDetail: (id) => set({ selectedBookingId: id }),
      closeBookingDetail: () => set({ selectedBookingId: null }),
      openBookingDetailFromNotification: (bookingId) => set((state) => {
        // Find booking in history
        const booking = state.bookingHistory.find(b => b.id === bookingId)
        
        if (booking) {
          // Booking found - open detail modal
          console.log('[Store] Opening booking detail from notification:', bookingId)
          return {
            selectedBookingId: bookingId,
            currentScreen: 'history', // Navigate to history (modal overlays)
          }
        } else {
          // Booking not found - fallback to history screen
          console.log('[Store] Booking not found from notification, showing history:', bookingId)
          return {
            currentScreen: 'history',
          }
        }
      }),
      
      // Receipt Modal
      receiptBookingId: null,
      openReceipt: (id) => set({ receiptBookingId: id }),
      closeReceipt: () => set({ receiptBookingId: null }),
      setTipForBooking: (id, tipAmount) => set((state) => {
        const updatedHistory = state.bookingHistory.map(b =>
          b.id === id ? { ...b, tipAmount } : b
        )
        const updatedActive = state.activeBooking?.id === id
          ? { ...state.activeBooking, tipAmount }
          : state.activeBooking
        return {
          bookingHistory: updatedHistory,
          activeBooking: updatedActive,
        }
      }),
      
      // Modal Management
      activeModal: null,
      setActiveModal: (modal) => set({ activeModal: modal, modalStep: 1 }),
      setActiveModalPreserveStep: (modal) => set({ activeModal: modal }),
      pendingReturnModal: null,
      pendingReturnModalStep: 1,
      setPendingReturnModal: (modal, step = 1) => set({ pendingReturnModal: modal, pendingReturnModalStep: step }),
      modalStep: 1,
      setModalStep: (step) => set({ modalStep: step }),
      nextModalStep: () => set((state) => ({ modalStep: state.modalStep + 1 })),
      prevModalStep: () => set((state) => ({ modalStep: Math.max(1, state.modalStep - 1) })),
      resetModalStep: () => set({ modalStep: 1 }),
      
      // Form Data
      serviceFormData: initialServiceFormData,
      setServiceFormData: (data) => set((state) => ({
        serviceFormData: { ...state.serviceFormData, ...data }
      })),
      resetServiceFormData: () => set({ serviceFormData: initialServiceFormData }),
      
      towingFormData: initialTowingFormData,
      setTowingFormData: (data) => set((state) => ({
        towingFormData: { ...state.towingFormData, ...data }
      })),
      resetTowingFormData: () => set({ towingFormData: initialTowingFormData }),
      
      evChargingFormData: initialEVChargingFormData,
      setEVChargingFormData: (data) => set((state) => ({
        evChargingFormData: { ...state.evChargingFormData, ...data }
      })),
      resetEVChargingFormData: () => set({ evChargingFormData: initialEVChargingFormData }),
      
      detailingFormData: initialDetailingFormData,
      setDetailingFormData: (data) => set((state) => ({
        detailingFormData: { ...state.detailingFormData, ...data }
      })),
      resetDetailingFormData: () => set({ detailingFormData: initialDetailingFormData }),
      
      windowTintingFormData: initialWindowTintingFormData,
      setWindowTintingFormData: (data) => set((state) => ({
        windowTintingFormData: { ...state.windowTintingFormData, ...data }
      })),
      resetWindowTintingFormData: () => set({ windowTintingFormData: initialWindowTintingFormData }),
      
      // Loading States
      isCalculating: false,
      setIsCalculating: (loading) => set({ isCalculating: loading }),
      isSubmitting: false,
      setIsSubmitting: (loading) => set({ isSubmitting: loading }),
      showSuccess: false,
      setShowSuccess: (show) => set({ showSuccess: show }),
      
      // Search
      searchQuery: '',
      setSearchQuery: (query) => set({ searchQuery: query }),
    }),
    {
      name: 'aid-bookings-v1',
      storage: createJSONStorage(() => getStorage()),
      // v1 drops data left by the old on-device demo (simulated chat threads and made-up providers).
      // v2 (E6) drops the cached profile/sign-in flag; data saved before v2 has no owner stamp, so the
      // next sign-in wipes it rather than guess whose it is.
      version: 2,
      migrate: (persisted) => stripLegacyDemoState(persisted) as unknown as AppState,
      // Only persist booking data + confirmed location + vehicles + whose they are — NOT UI state
      // (modals, forms, loading states) and never a role or sign-in state (E6: those come from the server).
      partialize: (state) => ({
        ownerId: state.ownerId,
        ownerRole: state.ownerRole,
        bookingHistory: state.bookingHistory,
        activeBooking: state.activeBooking,
        // Confirmed location (survives restart so user doesn't have to re-confirm)
        userLocationLabel: state.userLocationLabel,
        userCoords: state.userCoords,
        locationConfirmedAt: state.locationConfirmedAt,
        vehicles: state.vehicles,
        activeVehicleId: state.activeVehicleId,
      }),
    }
  )
)

/**
 * Remove state persisted by the old on-device demo: simulated chat threads, notification
 * bookkeeping, and the made-up provider (`mechanic`) attached to local bookings.
 */
export function stripLegacyDemoState(persisted: unknown): Record<string, unknown> {
  const state = { ...((persisted as Record<string, unknown>) || {}) }
  delete state.bookingMessages
  delete state.lastNotifiedStatusByBooking
  // E6: a cached profile/role/sign-in flag is never trusted.
  delete state.user
  delete state.isAuthed
  const clean = (booking: unknown) => {
    if (!booking || typeof booking !== 'object') return booking
    const rest = { ...(booking as Record<string, unknown>) }
    delete rest.mechanic
    return rest
  }
  if (Array.isArray(state.bookingHistory)) state.bookingHistory = state.bookingHistory.map(clean)
  if (state.activeBooking) state.activeBooking = clean(state.activeBooking)
  return state
}
