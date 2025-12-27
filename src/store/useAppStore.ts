import { create } from 'zustand'
import { Booking, Mechanic, Notification, ServiceType } from '../types'
import { nearbyMechanics, mockNotifications, mockBookingHistory } from '../data/mockData'

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
  | null

// Form data types
export interface ServiceFormData {
  selectedService: ServiceType | null
  problemDescription: string
  vehicleType: 'sedan' | 'suv' | 'truck' | 'van' | 'motorcycle' | null
  photoUrl?: string
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

interface AppState {
  // User & Location
  userLocation: { lat: number; lng: number }
  setUserLocation: (location: { lat: number; lng: number }) => void
  
  // Bookings
  activeBooking: Booking | null
  setActiveBooking: (booking: Booking | null) => void
  bookingHistory: Booking[]
  addToBookingHistory: (booking: Booking) => void
  
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
  
  // Modal Management
  activeModal: ModalType
  setActiveModal: (modal: ModalType) => void
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

export const useAppStore = create<AppState>((set) => ({
  // User & Location
  userLocation: { lat: 32.7767, lng: -96.7970 },
  setUserLocation: (location) => set({ userLocation: location }),
  
  // Bookings
  activeBooking: null,
  setActiveBooking: (booking) => set({ activeBooking: booking }),
  bookingHistory: mockBookingHistory,
  addToBookingHistory: (booking) => set((state) => ({
    bookingHistory: [booking, ...state.bookingHistory]
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
  
  // Modal Management
  activeModal: null,
  setActiveModal: (modal) => set({ activeModal: modal, modalStep: 1 }),
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
}))
