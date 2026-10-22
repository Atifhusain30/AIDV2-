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
