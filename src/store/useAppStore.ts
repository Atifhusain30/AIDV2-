import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { Booking, BookingStatus, Mechanic, Notification, ServiceType } from '../types'
import { nearbyMechanics, mockNotifications } from '../data/mockData'

// Modal types
export type ModalType = 
  | 'services' 
  | 'towing' 
  | 'ev_charging' 
  | 'detailing' 
  | 'window_tinting'
  | 'emergency_sos'
  | 'history'
  | 'search'
  | 'locationConfirm'
  | null

// Geolocation coordinates type
export type GeoCoords = { lat: number; lng: number; accuracy?: number }

// Chat message types
export type MessageKind = 'user_message' | 'provider_intro' | 'provider_auto_reply' | 'status_update'
export type MessageSender = 'user' | 'provider' | 'system'

export interface ChatMessage {
  id: string
  bookingId: string
  sender: MessageSender
  text: string
  timestamp: string // ISO string for serialization
  meta?: {
    kind?: MessageKind
  }
}

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
  // Auth + User Profile
  isAuthed: boolean
  user: UserProfile | null
  signInMock: (payload: { name: string; phone: string; email?: string }) => void
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
  /** Shown once when the server reports the active job was cancelled by the other side (not persisted). */
  endedBookingNotice: { bookingId: string; serviceName: string; driverName?: string; byCustomer?: boolean } | null
  setEndedBookingNotice: (notice: AppState['endedBookingNotice']) => void
  bookingHistory: Booking[]
  addToBookingHistory: (booking: Booking) => void
  updateBookingInHistory: (id: string, updates: Partial<Booking>) => void
  rebookFromHistory: (bookingId: string) => void
  matchProviderForBooking: (bookingId: string) => void
  clearBookings: () => void
  
  // Chat Messages (persisted per booking)
  bookingMessages: Record<string, ChatMessage[]>
  appendMessage: (bookingId: string, message: Omit<ChatMessage, 'id' | 'bookingId' | 'timestamp'> & { timestamp?: string }) => void
  clearBookingMessages: (bookingId: string) => void
  
  // Push Notification Tracking (persisted to avoid duplicate notifications)
  lastNotifiedStatusByBooking: Record<string, BookingStatus>
  setLastNotifiedStatus: (bookingId: string, status: BookingStatus) => void
  
  // Mechanics
  mechanics: Mechanic[]
  setMechanics: (mechanics: Mechanic[]) => void
  
  // Notifications
  notifications: Notification[]
  unreadCount: number
  markNotificationRead: (id: string) => void
  
  // Legacy service selection
  selectedService: ServiceType | null
  setSelectedService: (service: ServiceType | null) => void
  isServicesModalOpen: boolean
  setServicesModalOpen: (open: boolean) => void
  
  // Navigation
  currentScreen: 'home' | 'history' | 'chat' | 'profile'
  setCurrentScreen: (screen: 'home' | 'history' | 'chat' | 'profile') => void
  
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
  recentSearches: string[]
  addRecentSearch: (search: string) => void
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

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Auth + User Profile
      isAuthed: false,
      user: null,
      signInMock: (payload) => set((state) => ({
        isAuthed: true,
        user: state.user 
          ? { ...state.user, ...payload }
          : { id: crypto.randomUUID(), ...payload },
      })),
      signOut: () => set({
        isAuthed: false,
        user: null,
        activeVehicleId: null,
      }),
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
        }
      }),
      matchProviderForBooking: (bookingId) => set((state) => {
        // Find booking (could be active or in history)
        const isActiveBooking = state.activeBooking?.id === bookingId
        const bookingInHistory = state.bookingHistory.find(b => b.id === bookingId)
        
        if (!isActiveBooking && !bookingInHistory) return state
        
        // Pick a provider from mechanics list or create fallback
        let matchedMechanic: Mechanic
        
        if (state.mechanics && state.mechanics.length > 0) {
          // Pick a random mechanic from the list
          const randomIndex = Math.floor(Math.random() * state.mechanics.length)
          const selectedMechanic = state.mechanics[randomIndex]
          matchedMechanic = {
            ...selectedMechanic,
            eta: 5 + Math.floor(Math.random() * 10), // 5-15 min ETA
          }
        } else {
          // Fallback provider
          const randomNum = Math.floor(100 + Math.random() * 900)
          matchedMechanic = {
            id: crypto.randomUUID(),
            name: `AID Pro #${randomNum}`,
            initials: 'AP',
            rating: 4.5 + Math.random() * 0.5, // 4.5-5.0
            totalJobs: Math.floor(50 + Math.random() * 200),
            specializations: [],
            location: { lat: 32.78, lng: -96.80 },
            eta: 8 + Math.floor(Math.random() * 10),
            isOnline: true,
          }
        }
        
        // Update both activeBooking and bookingHistory
        const providerUpdate: Partial<Booking> = {
          mechanic: matchedMechanic,
          driverId: matchedMechanic.id,
          estimatedArrival: matchedMechanic.eta,
          acceptedAt: new Date(),
        }
        
        return {
          activeBooking: isActiveBooking && state.activeBooking
            ? { ...state.activeBooking, ...providerUpdate }
            : state.activeBooking,
          bookingHistory: state.bookingHistory.map(b =>
            b.id === bookingId ? { ...b, ...providerUpdate } : b
          ),
        }
      }),
      clearBookings: () => set({ bookingHistory: [], activeBooking: null, bookingMessages: {} }),
      
      // Chat Messages (persisted per booking)
      bookingMessages: {},
      appendMessage: (bookingId, messageData) => set((state) => {
        const newMessage: ChatMessage = {
          id: crypto.randomUUID(),
          bookingId,
          sender: messageData.sender,
          text: messageData.text,
          timestamp: messageData.timestamp || new Date().toISOString(),
          meta: messageData.meta,
        }
        const existingMessages = state.bookingMessages[bookingId] || []
        return {
          bookingMessages: {
            ...state.bookingMessages,
            [bookingId]: [...existingMessages, newMessage],
          },
        }
      }),
      clearBookingMessages: (bookingId) => set((state) => {
        const { [bookingId]: _, ...rest } = state.bookingMessages
        return { bookingMessages: rest }
      }),
      
      // Push Notification Tracking (persisted to avoid duplicate notifications)
      lastNotifiedStatusByBooking: {},
      setLastNotifiedStatus: (bookingId, status) => set((state) => ({
        lastNotifiedStatusByBooking: {
          ...state.lastNotifiedStatusByBooking,
          [bookingId]: status,
        },
      })),
      
      // Mechanics
      mechanics: nearbyMechanics,
      setMechanics: (mechanics) => set({ mechanics }),
      
      // Notifications
      notifications: mockNotifications,
      unreadCount: mockNotifications.filter(n => !n.isRead).length,
      markNotificationRead: (id) => set((state) => ({
        notifications: state.notifications.map(n => 
          n.id === id ? { ...n, isRead: true } : n
        ),
        unreadCount: state.notifications.filter(n => !n.isRead && n.id !== id).length,
      })),
      
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
      recentSearches: ['Oil change', 'Flat tire help', 'Towing service'],
      addRecentSearch: (search) => set((state) => ({
        recentSearches: [search, ...state.recentSearches.filter(s => s !== search)].slice(0, 5)
      })),
    }),
    {
      name: 'aid-bookings-v1',
      storage: createJSONStorage(() => getStorage()),
      // Only persist booking data + messages + notification tracking + confirmed location + auth + vehicles - NOT UI state (modals, forms, loading states)
      partialize: (state) => ({
        bookingHistory: state.bookingHistory,
        activeBooking: state.activeBooking,
        bookingMessages: state.bookingMessages,
        lastNotifiedStatusByBooking: state.lastNotifiedStatusByBooking,
        // Confirmed location (survives restart so user doesn't have to re-confirm)
        userLocationLabel: state.userLocationLabel,
        userCoords: state.userCoords,
        locationConfirmedAt: state.locationConfirmedAt,
        // Auth + User Profile + Vehicles
        isAuthed: state.isAuthed,
        user: state.user,
        vehicles: state.vehicles,
        activeVehicleId: state.activeVehicleId,
      }),
    }
  )
)

// Selector helpers (external to avoid circular reference)
export const getBookingMessages = (bookingId: string): ChatMessage[] => {
  return useAppStore.getState().bookingMessages[bookingId] || []
}

export const hasProviderIntroMessage = (bookingId: string): boolean => {
  const messages = useAppStore.getState().bookingMessages[bookingId] || []
  return messages.some((m: ChatMessage) => m.meta?.kind === 'provider_intro')
}

export const getLastNotifiedStatus = (bookingId: string): BookingStatus | undefined => {
  return useAppStore.getState().lastNotifiedStatusByBooking[bookingId]
}
