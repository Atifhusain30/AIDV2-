import type { Booking, ServiceRequest, Location, ApiResponse, Service, ServiceType, VerificationStatus } from '../types'
import type { UserVehicle } from '../store/useAppStore'
import { supabase, managedAuth } from '../auth/supabase'

function normalizeApiBaseUrl(value?: string): string {
  const base = (value || 'http://127.0.0.1:3001').replace(/\/$/, '')
  return base.endsWith('/api') ? base : `${base}/api`
}

const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_URL)

function parseBooking(booking: Booking): Booking {
  return {
    ...booking,
    createdAt: new Date(booking.createdAt),
    acceptedAt: booking.acceptedAt ? new Date(booking.acceptedAt) : undefined,
    completedAt: booking.completedAt ? new Date(booking.completedAt) : undefined,
  }
}

async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) return { success: false, error: 'Unable to read your secure session.' }
    if (!session?.access_token) return { success: false, error: 'Please sign in to continue.' }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        ...options.headers,
      },
    })
    const isJson = response.headers.get('content-type')?.includes('application/json')
    const data = isJson ? await response.json() : undefined
    if (!response.ok) return { success: false, error: data?.error || data?.message || `Request failed (${response.status})` }
    return { success: true, data: data as T }
  } catch (error) {
    console.error(`[AID API] ${endpoint}`, error)
    return { success: false, error: 'Unable to reach AID. Check your connection and try again.' }
  }
}

export interface ApiProfile {
  id: string
  email: string
  role: 'customer' | 'driver'
  status: string
  firstName: string
  lastName: string
  phone: string
  createdAt: string
  verificationStatus?: VerificationStatus
  credentialsValidUntil?: string | null
  isVerified?: boolean
  isOnline?: boolean
  rating?: number
  totalJobs?: number
  specializations?: ServiceType[]
}

export async function getProfile(): Promise<ApiResponse<ApiProfile>> {
  return apiFetch('/me')
}

export async function updateProfile(input: { firstName?: string; lastName?: string; phone?: string }) {
  return apiFetch('/me', { method: 'PATCH', body: JSON.stringify(input) })
}

export async function deleteAccount(): Promise<ApiResponse<void>> {
  return apiFetch('/me', { method: 'DELETE' })
}

export async function listVehicles(): Promise<ApiResponse<UserVehicle[]>> {
  return apiFetch('/vehicles')
}

export async function createVehicle(input: Omit<UserVehicle, 'id' | 'createdAt'>): Promise<ApiResponse<UserVehicle>> {
  return apiFetch('/vehicles', { method: 'POST', body: JSON.stringify({ ...input, licensePlate: input.plate }) })
}

export async function updateVehicle(id: string, input: Omit<UserVehicle, 'id' | 'createdAt'>): Promise<ApiResponse<UserVehicle>> {
  return apiFetch(`/vehicles/${id}`, { method: 'PATCH', body: JSON.stringify({ ...input, licensePlate: input.plate }) })
}

export async function deleteVehicle(id: string): Promise<ApiResponse<void>> {
  return apiFetch(`/vehicles/${id}`, { method: 'DELETE' })
}

/** Server-owned service catalog: the price shown is the price charged. */
export interface ServiceOption extends Service {
  available: boolean
  requiresDropoff: boolean
  /** Distance pricing (towing): hook-up fee covers includedMiles, then perMile. */
  pricing?: { hookup: number; includedMiles: number; perMile: number; maxMiles: number }
}

export async function listServices(): Promise<ApiResponse<ServiceOption[]>> {
  return apiFetch('/services')
}

export interface PriceQuote {
  serviceType: ServiceType
  price: number
  distanceMiles: number | null
}

/** Exact price the server will charge for this request (same calculation as booking). */
export async function quoteBooking(payload: Omit<CreateBookingPayload, 'vehicleId' | 'notes'>): Promise<ApiResponse<PriceQuote>> {
  return apiFetch('/quotes', { method: 'POST', body: JSON.stringify(payload) })
}

export interface CreateBookingPayload {
  serviceType: Booking['service']['id']
  vehicleId?: string | null
  location: { address: string; lat: number; lng: number }
  dropoffLocation?: { address: string; lat: number; lng: number }
  notes?: string
}

export async function createBooking(payload: CreateBookingPayload): Promise<ApiResponse<Booking>> {
  const result = await apiFetch<Booking>('/bookings', { method: 'POST', body: JSON.stringify(payload) })
  return result.success && result.data ? { ...result, data: parseBooking(result.data) } : result
}

export async function listBookings(): Promise<ApiResponse<Booking[]>> {
  const result = await apiFetch<Booking[]>('/bookings')
  return result.success && result.data ? { ...result, data: result.data.map(parseBooking) } : result
}

export async function getBooking(bookingId: string): Promise<ApiResponse<Booking>> {
  const result = await apiFetch<Booking>(`/bookings/${bookingId}`)
  return result.success && result.data ? { ...result, data: parseBooking(result.data) } : result
}

export async function getActiveBooking(_customerId?: string): Promise<ApiResponse<Booking | null>> {
  const result = await apiFetch<Booking | null>('/bookings/active')
  return result.success && result.data ? { ...result, data: parseBooking(result.data) } : result
}

export async function getDriverActiveBooking(_driverId?: string): Promise<ApiResponse<Booking | null>> {
  return getActiveBooking()
}

export async function getServiceRequests(): Promise<ApiResponse<ServiceRequest[]>> {
  const result = await apiFetch<ServiceRequest[]>('/drivers/requests')
  if (!result.success || !result.data) return result
  return {
    ...result,
    data: result.data.map((request) => ({
      ...request,
      createdAt: new Date(request.createdAt),
      expiresAt: new Date(request.expiresAt),
    })),
  }
}

export async function acceptServiceRequest(requestId: string, _driverId?: string): Promise<ApiResponse<Booking>> {
  const result = await apiFetch<Booking>(`/bookings/${requestId}/accept`, { method: 'POST' })
  return result.success && result.data ? { ...result, data: parseBooking(result.data) } : result
}

export async function updateBookingStatus(bookingId: string, status: Booking['status']): Promise<ApiResponse<Booking>> {
  const result = await apiFetch<Booking>(`/bookings/${bookingId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
  return result.success && result.data ? { ...result, data: parseBooking(result.data) } : result
}

export async function updateDriverLocation(bookingId: string, location: Location): Promise<ApiResponse<Booking>> {
  const result = await apiFetch<Booking>(`/bookings/${bookingId}/driver-location`, { method: 'PATCH', body: JSON.stringify({ location }) })
  return result.success && result.data ? { ...result, data: parseBooking(result.data) } : result
}

export async function updateDriverOnlineStatus(_driverId: string | undefined, isOnline: boolean): Promise<ApiResponse<{ isOnline: boolean }>> {
  return apiFetch('/drivers/me/online', { method: 'PATCH', body: JSON.stringify({ isOnline }) })
}

export async function createPaymentIntent(bookingId: string) {
  return apiFetch<{ id: string; clientSecret: string; amount: number; currency: string; status: string }>('/payments/create-intent', {
    method: 'POST', body: JSON.stringify({ bookingId }),
  })
}

// Authentication is handled directly through Supabase; these aliases preserve the previous public service surface.
export const customerLogin = (email: string, password: string) => managedAuth.signIn('customer', email, password)
export const driverLogin = (email: string, password: string) => managedAuth.signIn('driver', email, password)
export const customerRegister = (email: string, password: string, firstName: string, lastName: string, phone: string) =>
  managedAuth.register('customer', { email, password, firstName, lastName, phone })
export const driverRegister = (email: string, password: string, firstName: string, lastName: string, phone: string) =>
  managedAuth.register('driver', { email, password, firstName, lastName, phone })
export function logout(): void { void managedAuth.signOut() }
export function getAuthState() { return { isAuthenticated: false, user: null, token: null } }

export const apiService = {
  customerLogin, customerRegister, driverLogin, driverRegister, logout, getAuthState,
  getProfile, updateProfile, deleteAccount, listVehicles, createVehicle, updateVehicle, deleteVehicle,
  listServices, quoteBooking, createBooking, listBookings, getBooking, updateBookingStatus, getActiveBooking, getDriverActiveBooking,
  getServiceRequests, acceptServiceRequest, updateDriverLocation, updateDriverOnlineStatus, createPaymentIntent,
}

export { normalizeApiBaseUrl }
export default apiService
