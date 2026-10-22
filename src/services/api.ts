import type { Booking, ServiceRequest, Location, ApiResponse, Service, ServiceType, VerificationStatus, DriverVehicle, DriverEquipmentType } from '../types'
import type { UserVehicle } from '../store/useAppStore'
import { supabase, managedAuth } from '../auth/supabase'
import type { PendingRating, RatingInput } from '../lib/ratings'
import type { SupportConfig, SupportReport } from '../lib/support'
import type { BlockResult, ChatMessage, ChatPage } from '../lib/chat'
import type { TicketResult } from '../lib/realtime'

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
    arrivedAt: booking.arrivedAt ? new Date(booking.arrivedAt) : undefined,
    startedAt: booking.startedAt ? new Date(booking.startedAt) : undefined,
    completedAt: booking.completedAt ? new Date(booking.completedAt) : undefined,
    cancelledAt: booking.cancelledAt ? new Date(booking.cancelledAt) : undefined,
    expiredAt: booking.expiredAt ? new Date(booking.expiredAt) : undefined,
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
    if (!response.ok) {
      return {
        success: false,
        error: data?.error || data?.message || `Request failed (${response.status})`,
        ...(typeof data?.field === 'string' ? { field: data.field } : {}),
        ...(typeof data?.code === 'string' ? { code: data.code } : {}),
      }
    }
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
  /** Average of ratings received — null until MIN_RATINGS_TO_SHOW ratings exist (B15). */
  rating?: number | null
  ratingCount?: number
  /** Jobs completed as a driver. */
  totalJobs?: number
  specializations?: ServiceType[]
  driverVehicle?: DriverVehicle | null
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
  /** Driver equipment that can perform this service (server-owned; empty = no driver takes it). */
  equipmentTypes?: DriverEquipmentType[]
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

/** Open requests near the driver (server-filtered by radius and equipment, nearest first). */
export interface NearbyRequests {
  status: 'ok' | 'location_required'
  radiusMiles: number
  requests: ServiceRequest[]
}

/** `position` is the driver's current location; without it the server uses its last fresh one. */
export async function getServiceRequests(position?: { lat: number; lng: number }): Promise<ApiResponse<NearbyRequests>> {
  const query = position ? `?lat=${encodeURIComponent(position.lat)}&lng=${encodeURIComponent(position.lng)}` : ''
  const result = await apiFetch<NearbyRequests>(`/drivers/requests${query}`)
  if (!result.success || !result.data) return result
  return {
    ...result,
    data: {
      ...result.data,
      requests: (result.data.requests || []).map((request) => ({
        ...request,
        createdAt: new Date(request.createdAt),
        expiresAt: new Date(request.expiresAt),
      })),
    },
  }
}

export async function acceptServiceRequest(requestId: string, _driverId?: string): Promise<ApiResponse<Booking>> {
  const result = await apiFetch<Booking>(`/bookings/${requestId}/accept`, { method: 'POST' })
  return result.success && result.data ? { ...result, data: parseBooking(result.data) } : result
}

/** `reason` is a cancellation reason code (required for drivers; see src/lib/jobLifecycle.ts). */
export async function updateBookingStatus(bookingId: string, status: Booking['status'], reason?: string): Promise<ApiResponse<Booking>> {
  const result = await apiFetch<Booking>(`/bookings/${bookingId}/status`, { method: 'PATCH', body: JSON.stringify(reason ? { status, reason } : { status }) })
  return result.success && result.data ? { ...result, data: parseBooking(result.data) } : result
}

/** B18: support contact (null when not configured) and report limits. Public endpoint. */
export async function getSupportConfig(): Promise<ApiResponse<SupportConfig>> {
  try {
    const response = await fetch(`${API_BASE_URL}/support/config`)
    if (!response.ok) return { success: false, error: `Request failed (${response.status})` }
    return { success: true, data: await response.json() as SupportConfig }
  } catch {
    return { success: false, error: 'Unable to reach AID. Check your connection and try again.' }
  }
}

/** B18: report a problem — general, or about one of your own jobs (`bookingId`). Also used by "Report an issue" on a job. */
export async function createSupportReport(input: { category: string; message?: string; bookingId?: string | null }): Promise<ApiResponse<SupportReport>> {
  return apiFetch('/support/reports', { method: 'POST', body: JSON.stringify(input) })
}

/** B18: the signed-in person's own reports with their status (never the AID team's internal notes). */
export async function listSupportReports(): Promise<ApiResponse<SupportReport[]>> {
  return apiFetch('/support/reports')
}

/** B12: chat messages of one of your jobs — the newest page, or only those after `after` (polling cursor). */
export async function listJobMessages(bookingId: string, after?: string | null): Promise<ApiResponse<ChatPage>> {
  return apiFetch(`/bookings/${encodeURIComponent(bookingId)}/messages${after ? `?after=${encodeURIComponent(after)}` : ''}`)
}

/** B12: send a message (text only). `clientId` makes a retry safe: the server stores it once. */
export async function sendJobMessage(bookingId: string, body: string, clientId: string): Promise<ApiResponse<ChatMessage>> {
  return apiFetch(`/bookings/${encodeURIComponent(bookingId)}/messages`, { method: 'POST', body: JSON.stringify({ body, clientId }) })
}

/** B12: mark the other person's messages up to `upTo` as read. */
export async function markJobMessagesRead(bookingId: string, upTo: string | null): Promise<ApiResponse<{ marked: number }>> {
  return apiFetch(`/bookings/${encodeURIComponent(bookingId)}/messages/read`, { method: 'POST', body: JSON.stringify(upTo ? { upTo } : {}) })
}

/** B12: block the other person on this job (closes the chat; never matched again; doesn't cancel the job). */
export async function blockJobParty(bookingId: string): Promise<ApiResponse<BlockResult>> {
  return apiFetch(`/bookings/${encodeURIComponent(bookingId)}/block`, { method: 'POST', body: JSON.stringify({}) })
}

/** B15: completed jobs the signed-in person can still rate, newest first. */
export async function listPendingRatings(): Promise<ApiResponse<PendingRating[]>> {
  return apiFetch('/ratings/pending')
}

/** B15: rate the other person on a completed job (once; the server checks every rule). */
export async function submitRating(bookingId: string, input: RatingInput): Promise<ApiResponse<{ bookingId: string; stars: number }>> {
  return apiFetch(`/bookings/${bookingId}/rating`, { method: 'POST', body: JSON.stringify(input) })
}

export async function updateDriverLocation(bookingId: string, location: Location): Promise<ApiResponse<Booking>> {
  const result = await apiFetch<Booking>(`/bookings/${bookingId}/driver-location`, { method: 'PATCH', body: JSON.stringify({ location }) })
  return result.success && result.data ? { ...result, data: parseBooking(result.data) } : result
}

export async function updateDriverOnlineStatus(_driverId: string | undefined, isOnline: boolean): Promise<ApiResponse<{ isOnline: boolean }>> {
  return apiFetch('/drivers/me/online', { method: 'PATCH', body: JSON.stringify({ isOnline }) })
}

/** Save the driver's service vehicle; on a 400 the server names the failing `field`. */
export async function updateDriverVehicle(vehicle: DriverVehicle): Promise<ApiResponse<DriverVehicle>> {
  return apiFetch('/drivers/me/vehicle', { method: 'PATCH', body: JSON.stringify(vehicle) })
}

/**
 * B11: a single-use, 30-second ticket for the live-update stream, and the stream URL that uses it.
 * The session token itself never goes in a URL.
 */
export async function createRealtimeTicket(): Promise<TicketResult> {
  const result = await apiFetch<{ ticket: string; streamPath?: string }>('/realtime/ticket', { method: 'POST', body: JSON.stringify({}) })
  if (result.success && result.data?.ticket) {
    return { ok: true, url: `${API_BASE_URL}/realtime/stream?ticket=${encodeURIComponent(result.data.ticket)}` }
  }
  if (result.code === 'realtime_disabled') return { ok: false, disabled: true }
  if (result.code === 'too_many_streams' || result.code === 'rate_limited') return { ok: false, retryAfterMs: 30_000 }
  return { ok: false }
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
  listPendingRatings, submitRating, getSupportConfig, createSupportReport, listSupportReports,
  listJobMessages, sendJobMessage, markJobMessagesRead, blockJobParty,
  getServiceRequests, acceptServiceRequest, updateDriverLocation, updateDriverOnlineStatus, updateDriverVehicle, createPaymentIntent,
  createRealtimeTicket,
}

export { normalizeApiBaseUrl }
export default apiService
