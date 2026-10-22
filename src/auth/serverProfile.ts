/**
 * E6: the signed-in person's role comes from the AID server (GET /api/me → the `profiles` table),
 * never from the phone. Sign-in metadata (user_metadata.role) can be edited by the account holder,
 * and anything in local storage can be edited by whoever holds the phone, so neither decides which
 * screens open. The server also checks the role on every request (E1).
 */

import type { Customer, Driver, ServiceType, VerificationStatus, DriverVehicle } from '../types'
import { API_BASE_URL } from '../services/apiBase'

export interface ApiProfile {
  id: string
  email: string
  role: 'customer' | 'driver' | 'admin'
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

export type ProfileResult =
  | { ok: true; profile: ApiProfile }
  /** status: the server's answer (401 = session no longer valid, 403 = account not active); network: unreachable. */
  | { ok: false; status?: number; network?: boolean }

export type FetchProfile = (accessToken: string) => Promise<ProfileResult>

/** GET /api/me with the given session token. */
export function createProfileFetcher(fetchImpl: typeof fetch = (...args) => fetch(...args), baseUrl = API_BASE_URL): FetchProfile {
  return async (accessToken) => {
    let response: Response
    try {
      response = await fetchImpl(`${baseUrl}/me`, { headers: { Authorization: `Bearer ${accessToken}` } })
    } catch {
      return { ok: false, network: true }
    }
    if (!response.ok) return { ok: false, status: response.status }
    try {
      const profile = await response.json() as ApiProfile
      if (!profile || typeof profile.id !== 'string' || typeof profile.role !== 'string') return { ok: false, status: response.status }
      return { ok: true, profile }
    } catch {
      return { ok: false, status: response.status }
    }
  }
}

/** The app's user object, built only from the server profile (role included). */
export function profileToUser(profile: ApiProfile): Customer | Driver {
  const base = {
    id: profile.id,
    email: profile.email || '',
    phone: profile.phone || '',
    firstName: profile.firstName || profile.email?.split('@')[0] || 'AID',
    lastName: profile.lastName || '',
    createdAt: new Date(profile.createdAt || Date.now()),
  }
  if (profile.role === 'driver') {
    return {
      ...base,
      role: 'driver',
      isOnline: Boolean(profile.isOnline),
      isVerified: Boolean(profile.isVerified),
      verificationStatus: profile.verificationStatus || 'pending',
      credentialsValidUntil: profile.credentialsValidUntil ?? null,
      documents: [],
      rating: profile.rating ?? null,
      ratingCount: profile.ratingCount ?? 0,
      totalJobs: profile.totalJobs ?? 0,
      specializations: profile.specializations || [],
      vehicle: profile.driverVehicle ?? null,
    }
  }
  return { ...base, role: 'customer', savedAddresses: [], vehicles: [], paymentMethods: [] }
}
