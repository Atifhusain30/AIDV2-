/** Where the AID API lives (shared by the API client and the sign-in role check). */
export function normalizeApiBaseUrl(value?: string): string {
  const base = (value || 'http://127.0.0.1:3001').replace(/\/$/, '')
  return base.endsWith('/api') ? base : `${base}/api`
}

export const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_URL)
