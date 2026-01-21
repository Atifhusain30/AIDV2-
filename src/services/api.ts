/**
 * API Service - Backend Communication
 * Handles all backend API calls with fallback to local simulation
 * 
 * TODO: Replace simulation with real backend endpoints
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  Customer,
  Driver,
  Booking,
  ServiceRequest,
  Service,
  Location,
  AuthState,
  ApiResponse
} from '../types'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
const USE_MOCK = import.meta.env.DEV || !import.meta.env.VITE_API_URL

// Simulated delay for mock responses
const MOCK_DELAY = 500

/**
 * Helper to simulate network delay
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Generic fetch wrapper with error handling
 */
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const token = localStorage.getItem('auth_token')
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers
      }
    })

    const data = await response.json()

    if (!response.ok) {
      return { success: false, error: data.message || 'Request failed' }
    }

    return { success: true, data }
  } catch (error) {
    console.error(`[API] ${endpoint} failed:`, error)
    return { success: false, error: 'Network error' }
  }
}

// ============================================
// AUTHENTICATION
// ============================================

/**
 * Customer login
 */
export async function customerLogin(
  email: string,
  password: string
): Promise<ApiResponse<{ user: Customer; token: string }>> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY)
    const mockCustomer: Customer = {
      id: 'cust_' + uuidv4().substring(0, 8),
      email,
      phone: '+1 (555) 123-4567',
      firstName: email.split('@')[0],
      lastName: 'User',
      role: 'customer',
      createdAt: new Date(),
      savedAddresses: [],
      vehicles: [],
      paymentMethods: []
    }
    const token = 'mock_token_' + Date.now()
    localStorage.setItem('auth_token', token)
    localStorage.setItem('user', JSON.stringify(mockCustomer))
    return { success: true, data: { user: mockCustomer, token } }
  }

  return apiFetch('/auth/customer/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  })
}

/**
 * Driver login
 */
export async function driverLogin(
  email: string,
  password: string
): Promise<ApiResponse<{ user: Driver; token: string }>> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY)
    const mockDriver: Driver = {
      id: 'driver_' + uuidv4().substring(0, 8),
      email,
      phone: '+1 (555) 987-6543',
      firstName: email.split('@')[0],
      lastName: 'Driver',
      role: 'driver',
      createdAt: new Date(),
      isOnline: false,
      isVerified: false,
      verificationStatus: 'pending',
      documents: [],
      rating: 0,
      totalJobs: 0,
      specializations: []
    }
    const token = 'mock_driver_token_' + Date.now()
    localStorage.setItem('auth_token', token)
    localStorage.setItem('user', JSON.stringify(mockDriver))
    return { success: true, data: { user: mockDriver, token } }
  }

  return apiFetch('/auth/driver/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  })
}

/**
 * Register new customer
 */
export async function customerRegister(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  phone: string
): Promise<ApiResponse<{ user: Customer; token: string }>> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY)
    const mockCustomer: Customer = {
      id: 'cust_' + uuidv4().substring(0, 8),
      email,
      phone,
      firstName,
      lastName,
      role: 'customer',
      createdAt: new Date(),
      savedAddresses: [],
      vehicles: [],
      paymentMethods: []
    }
    const token = 'mock_token_' + Date.now()
    localStorage.setItem('auth_token', token)
    localStorage.setItem('user', JSON.stringify(mockCustomer))
    return { success: true, data: { user: mockCustomer, token } }
  }

  return apiFetch('/auth/customer/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, firstName, lastName, phone })
  })
}

/**
 * Register new driver
 */
export async function driverRegister(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  phone: string
): Promise<ApiResponse<{ user: Driver; token: string }>> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY)
    const mockDriver: Driver = {
      id: 'driver_' + uuidv4().substring(0, 8),
      email,
      phone,
      firstName,
      lastName,
      role: 'driver',
      createdAt: new Date(),
      isOnline: false,
      isVerified: false,
      verificationStatus: 'pending',
      documents: [],
      rating: 0,
      totalJobs: 0,
      specializations: []
    }
    const token = 'mock_driver_token_' + Date.now()
    localStorage.setItem('auth_token', token)
    localStorage.setItem('user', JSON.stringify(mockDriver))
    return { success: true, data: { user: mockDriver, token } }
  }

  return apiFetch('/auth/driver/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, firstName, lastName, phone })
  })
}

/**
 * Logout
 */
export function logout(): void {
  localStorage.removeItem('auth_token')
  localStorage.removeItem('user')
}

/**
 * Get current auth state
 */
export function getAuthState(): AuthState {
  const token = localStorage.getItem('auth_token')
  const userStr = localStorage.getItem('user')
  const user = userStr ? JSON.parse(userStr) : null
  
  return {
    isAuthenticated: !!token && !!user,
    user,
    token
  }
}

// ============================================
// BOOKINGS / SERVICE REQUESTS
// ============================================

// In-memory store for mock bookings
let mockBookings: Booking[] = []
let mockServiceRequests: ServiceRequest[] = []

/**
 * Create a new service request (booking)
 */
export async function createBooking(
  service: Service,
  location: Location,
  customerId: string,
  estimatedPrice: number,
  notes?: string
): Promise<ApiResponse<Booking>> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY)
    
    const booking: Booking = {
      id: 'booking_' + uuidv4().substring(0, 8),
      customerId,
      service,
      status: 'searching',
      location: {
        address: location.address || 'Current Location',
        lat: location.lat,
        lng: location.lng
      },
      estimatedPrice,
      notes,
      createdAt: new Date()
    }
    
    mockBookings.push(booking)
    
    // Create a service request for drivers
    const request: ServiceRequest = {
      id: booking.id,
      customerId,
      customerName: 'Customer', // Would come from auth
      customerPhone: '+1 (555) 123-4567',
      service,
      location,
      estimatedPrice,
      notes,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minute expiry
    }
    mockServiceRequests.push(request)
    
    return { success: true, data: booking }
  }

  return apiFetch('/bookings', {
    method: 'POST',
    body: JSON.stringify({ service, location, estimatedPrice, notes })
  })
}

/**
 * Get pending service requests for drivers
 */
export async function getServiceRequests(): Promise<ApiResponse<ServiceRequest[]>> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY)
    // Filter out expired requests
    const active = mockServiceRequests.filter(r => new Date(r.expiresAt) > new Date())
    return { success: true, data: active }
  }

  return apiFetch('/drivers/requests')
}

/**
 * Accept a service request (driver)
 */
export async function acceptServiceRequest(
  requestId: string,
  driverId: string
): Promise<ApiResponse<Booking>> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY)
    
    const bookingIndex = mockBookings.findIndex(b => b.id === requestId)
    if (bookingIndex === -1) {
      return { success: false, error: 'Booking not found' }
    }
    
    mockBookings[bookingIndex] = {
      ...mockBookings[bookingIndex],
      driverId,
      status: 'accepted',
      acceptedAt: new Date()
    }
    
    // Remove from pending requests
    mockServiceRequests = mockServiceRequests.filter(r => r.id !== requestId)
    
    return { success: true, data: mockBookings[bookingIndex] }
  }

  return apiFetch(`/bookings/${requestId}/accept`, {
    method: 'POST',
    body: JSON.stringify({ driverId })
  })
}

/**
 * Update booking status
 */
export async function updateBookingStatus(
  bookingId: string,
  status: Booking['status']
): Promise<ApiResponse<Booking>> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY)
    
    const bookingIndex = mockBookings.findIndex(b => b.id === bookingId)
    if (bookingIndex === -1) {
      return { success: false, error: 'Booking not found' }
    }
    
    mockBookings[bookingIndex] = {
      ...mockBookings[bookingIndex],
      status,
      ...(status === 'completed' && { completedAt: new Date() })
    }
    
    return { success: true, data: mockBookings[bookingIndex] }
  }

  return apiFetch(`/bookings/${bookingId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  })
}

/**
 * Get booking by ID
 */
export async function getBooking(bookingId: string): Promise<ApiResponse<Booking>> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY / 2)
    const booking = mockBookings.find(b => b.id === bookingId)
    if (!booking) {
      return { success: false, error: 'Booking not found' }
    }
    return { success: true, data: booking }
  }

  return apiFetch(`/bookings/${bookingId}`)
}

/**
 * Update driver location for tracking
 */
export async function updateDriverLocation(
  bookingId: string,
  location: Location
): Promise<ApiResponse<void>> {
  if (USE_MOCK) {
    const bookingIndex = mockBookings.findIndex(b => b.id === bookingId)
    if (bookingIndex !== -1) {
      mockBookings[bookingIndex].driverLocation = location
    }
    return { success: true }
  }

  return apiFetch(`/bookings/${bookingId}/driver-location`, {
    method: 'PATCH',
    body: JSON.stringify({ location })
  })
}

/**
 * Get active booking for customer
 */
export async function getActiveBooking(customerId: string): Promise<ApiResponse<Booking | null>> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY / 2)
    const activeStatuses: Booking['status'][] = ['pending', 'searching', 'accepted', 'en_route', 'arrived', 'in_progress']
    const booking = mockBookings.find(
      b => b.customerId === customerId && activeStatuses.includes(b.status)
    )
    return { success: true, data: booking || null }
  }

  return apiFetch(`/customers/${customerId}/active-booking`)
}

/**
 * Get active booking for driver
 */
export async function getDriverActiveBooking(driverId: string): Promise<ApiResponse<Booking | null>> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY / 2)
    const activeStatuses: Booking['status'][] = ['accepted', 'en_route', 'arrived', 'in_progress']
    const booking = mockBookings.find(
      b => b.driverId === driverId && activeStatuses.includes(b.status)
    )
    return { success: true, data: booking || null }
  }

  return apiFetch(`/drivers/${driverId}/active-booking`)
}

// ============================================
// DRIVER STATUS
// ============================================

/**
 * Update driver online status
 */
export async function updateDriverOnlineStatus(
  driverId: string,
  isOnline: boolean
): Promise<ApiResponse<void>> {
  if (USE_MOCK) {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      const user = JSON.parse(userStr) as Driver
      user.isOnline = isOnline
      localStorage.setItem('user', JSON.stringify(user))
    }
    return { success: true }
  }

  return apiFetch(`/drivers/${driverId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isOnline })
  })
}

export const apiService = {
  // Auth
  customerLogin,
  customerRegister,
  driverLogin,
  driverRegister,
  logout,
  getAuthState,
  
  // Bookings
  createBooking,
  getBooking,
  updateBookingStatus,
  getActiveBooking,
  getDriverActiveBooking,
  
  // Service Requests
  getServiceRequests,
  acceptServiceRequest,
  
  // Driver
  updateDriverLocation,
  updateDriverOnlineStatus
}

export default apiService
