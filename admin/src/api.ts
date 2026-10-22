/// <reference types="vite/client" />
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  AdminProfile, DriverDecision, DriverDetail, DriverSummary, QueueFilter, ReportCategory, ReportChat, ReportCounts, ReportDetail, ReportFilter, ReportStatus, ReportSummary, ReviewDocument,
} from './types'

let client: SupabaseClient | null = null

function supabase(): SupabaseClient {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error('Admin is not configured: missing Supabase environment variables.')
  // Session lives only for this browser tab; closing the tab signs the reviewer out.
  client = createClient(url, key, {
    auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })
  return client
}

const API_BASE_URL = (() => {
  const base = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '')
  return base.endsWith('/api') ? base : `${base}/api`
})()

const SESSION_EXPIRED = 'Your admin session expired. Sign in again.'
let sessionEndedListener: ((reason: string) => void) | null = null
let mfaRequiredListener: (() => void) | null = null

// ---------- E5: two-step sign-in (Supabase Auth TOTP) ----------

export const MFA_REQUIRED_CODE = 'mfa_required'

/** Where an admin is in two-step sign-in: done (aal2), must set up an authenticator app, or must enter a code. */
export type MfaState = { step: 'done' } | { step: 'enroll' } | { step: 'challenge'; factorId: string }

export interface TotpEnrollment {
  factorId: string
  /** SVG QR code as a data: URL (from Supabase). */
  qrCode: string
  /** Base32 setup key for typing into the app by hand. */
  secret: string
  uri: string
}

type AuthErrorLike = { code?: string; status?: number; message?: string; name?: string }

/** Plain-language message for an MFA failure (wrong code, old code, too many tries, offline…). */
export function mfaErrorMessage(error: unknown): string {
  if (error instanceof TypeError) return "Couldn't reach the sign-in service. Check your connection and try again."
  const failure = (error || {}) as AuthErrorLike
  const code = failure.code || ''
  if (failure.status === 429 || code === 'over_request_rate_limit' || code === 'too_many_requests' || /rate limit|too many/i.test(failure.message || '')) {
    return 'Too many attempts. Wait a minute, then try again with the current code.'
  }
  if (code === 'mfa_challenge_expired') return 'That code timed out. Enter the code your app shows now.'
  if (code === 'mfa_verification_failed' || code === 'mfa_verification_rejected' || /invalid totp|invalid code/i.test(failure.message || '')) {
    return "That code didn't work. Codes change every 30 seconds — enter the one your app shows now."
  }
  if (code === 'mfa_totp_enroll_not_enabled' || code === 'mfa_totp_verify_not_enabled') {
    return 'Authenticator apps are turned off for this AID project. Ask the owner to turn on TOTP in Supabase (Authentication → Multi-Factor).'
  }
  if (code === 'mfa_factor_name_conflict') return 'An earlier set-up is still open. Select Try again.'
  if (code === 'too_many_enrolled_mfa_factors') return 'This account has too many authenticator set-ups. Ask the AID owner to reset two-step verification for you.'
  if (code === 'session_not_found' || code === 'session_expired' || code === 'bad_jwt' || failure.status === 401) return SESSION_EXPIRED
  return failure.message || 'Something went wrong. Try again.'
}

const sixDigits = (code: string) => code.replace(/\D/g, '').slice(0, 6)

async function mfaState(): Promise<MfaState> {
  const auth = supabase().auth
  const { data: level, error } = await auth.mfa.getAuthenticatorAssuranceLevel()
  if (error) throw new Error(mfaErrorMessage(error))
  if (level.currentLevel === 'aal2') return { step: 'done' }
  const { data: factors, error: listError } = await auth.mfa.listFactors()
  if (listError) throw new Error(mfaErrorMessage(listError))
  const verified = factors.totp.find((factor) => factor.status === 'verified')
  return verified ? { step: 'challenge', factorId: verified.id } : { step: 'enroll' }
}

let enrollmentInFlight: Promise<TotpEnrollment> | null = null

/** One set-up at a time: a second call while one is running (React re-mount, double click) shares it. */
function startEnrollment(): Promise<TotpEnrollment> {
  if (!enrollmentInFlight) enrollmentInFlight = enrollTotp().finally(() => { enrollmentInFlight = null })
  return enrollmentInFlight
}

async function enrollTotp(): Promise<TotpEnrollment> {
  const auth = supabase().auth
  // A set-up that was started but never confirmed (page closed) blocks a new one with the same name: remove it.
  const { data: factors } = await auth.mfa.listFactors()
  for (const factor of factors?.all || []) {
    if (factor.factor_type === 'totp' && factor.status === 'unverified') await auth.mfa.unenroll({ factorId: factor.id })
  }
  const { data, error } = await auth.mfa.enroll({ factorType: 'totp', friendlyName: 'AID Admin', issuer: 'AID Admin' })
  if (error) throw new Error(mfaErrorMessage(error))
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri }
}

/** Check a 6-digit code (finishing set-up or signing in). On success the session becomes aal2. */
async function verifyCode(factorId: string, code: string): Promise<void> {
  const digits = sixDigits(code)
  if (digits.length !== 6) throw new Error('Enter the 6-digit code from your authenticator app.')
  let result
  try {
    result = await supabase().auth.mfa.challengeAndVerify({ factorId, code: digits })
  } catch (error) {
    throw new Error(mfaErrorMessage(error))
  }
  if (result.error) throw new Error(mfaErrorMessage(result.error))
}
let endingSession: Promise<void> | null = null

/**
 * E6: end the admin session in this tab and remove everything the admin site stored. It keeps the
 * session only in this tab's sessionStorage (nothing in localStorage), and both are cleared — even
 * when the sign-out call can't reach Supabase.
 */
async function endSession(): Promise<void> {
  if (endingSession) return endingSession
  endingSession = (async () => {
    try { await supabase().auth.signOut({ scope: 'local' }) } catch { /* offline: cleared below */ }
    try { window.sessionStorage.clear() } catch { /* unavailable */ }
    try { window.localStorage.clear() } catch { /* unavailable */ }
  })().finally(() => { endingSession = null })
  return endingSession
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase().auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error(SESSION_EXPIRED)
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    })
  } catch {
    throw new Error('Unable to reach the AID API. Is the server running?')
  }
  if (response.status === 403) {
    // E5: the server refuses admin data until this session has passed the authenticator-app step.
    const refusal = await response.clone().json().catch(() => null) as { code?: string; error?: string } | null
    if (refusal?.code === MFA_REQUIRED_CODE) {
      mfaRequiredListener?.()
      throw new Error(refusal.error || 'Enter the code from your authenticator app to continue.')
    }
  }
  if (response.status === 401) {
    // E6: the server no longer accepts this session — sign out of the admin site (once) and say so.
    const first = !endingSession
    await endSession()
    if (first) sessionEndedListener?.(SESSION_EXPIRED)
    throw new Error(SESSION_EXPIRED)
  }
  const body = await response.json().catch(() => null) as ({ error?: string } & T) | null
  if (!response.ok) throw new Error(body?.error || `Request failed (${response.status})`)
  return body as T
}

async function currentAdmin(): Promise<AdminProfile | null> {
  const { data } = await supabase().auth.getSession()
  if (!data.session) return null
  const profile = await call<AdminProfile & { role: string }>('/me')
  if (profile.role !== 'admin') {
    // Local scope: rejecting this tab must not sign the person out of the mobile app.
    await supabase().auth.signOut({ scope: 'local' })
    const kind = profile.role === 'driver' || profile.role === 'customer' ? `a ${profile.role}` : 'not an admin'
    throw new Error(`This account does not have admin access (${profile.email} is ${kind} account). Sign in with an admin account.`)
  }
  return profile
}

export const adminApi = {
  currentAdmin,
  async signIn(email: string, password: string): Promise<AdminProfile> {
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    if (error) throw new Error(error.message)
    const profile = await currentAdmin()
    if (!profile) throw new Error('Unable to start an admin session.')
    return profile
  },
  async signOut() {
    await endSession()
  },
  /** E6: told when the server refuses the session (401), so the site can return to sign-in. */
  onSessionEnded(listener: ((reason: string) => void) | null) {
    sessionEndedListener = listener
  },
  /** E5: two-step sign-in. */
  mfaState,
  startEnrollment,
  verifyCode,
  /** E5: told when the server answers mfa_required, so the site can ask for the code again. */
  onMfaRequired(listener: (() => void) | null) {
    mfaRequiredListener = listener
  },
  listDrivers: (filter: QueueFilter) => call<DriverSummary[]>(`/admin/drivers?status=${encodeURIComponent(filter)}`),
  getDriver: (driverId: string) => call<DriverDetail>(`/admin/drivers/${encodeURIComponent(driverId)}`),
  reviewDocument: (documentId: string, decision: 'approve' | 'reject', notes?: string) =>
    call<ReviewDocument>(`/admin/documents/${encodeURIComponent(documentId)}/review`, { method: 'POST', body: JSON.stringify({ decision, notes }) }),
  decide: (driverId: string, decision: DriverDecision, notes?: string) =>
    call(`/admin/drivers/${encodeURIComponent(driverId)}/decision`, { method: 'POST', body: JSON.stringify({ decision, notes }) }),
  // B18 reports inbox
  listReports: (filter: ReportFilter, category: ReportCategory | '' = '') =>
    call<{ reports: ReportSummary[]; counts: ReportCounts }>(`/admin/reports?status=${encodeURIComponent(filter)}${category ? `&category=${encodeURIComponent(category)}` : ''}`),
  getReport: (reportId: string) => call<ReportDetail>(`/admin/reports/${encodeURIComponent(reportId)}`),
  getReportChat: (reportId: string) => call<ReportChat>(`/admin/reports/${encodeURIComponent(reportId)}/messages`),
  updateReport: (reportId: string, change: { status?: ReportStatus; note?: string }) =>
    call<ReportDetail>(`/admin/reports/${encodeURIComponent(reportId)}`, { method: 'PATCH', body: JSON.stringify(change) }),
}
