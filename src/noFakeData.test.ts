/**
 * F3 regression guard: the customer and driver apps must not ship invented data.
 * Scans production source (not tests) for markers of the demo data removed in F3 — the
 * made-up providers, mock data module, simulated chat/matching/tracking and hard-coded figures.
 * Keep the list targeted: each entry is something that was actually removed.
 */
import { describe, expect, it } from 'vitest'

const sources = import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}', '!./test/**'], {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

const FORBIDDEN: { label: string; pattern: RegExp; allow?: string[] }[] = [
  // Made-up providers from the old mock data and fake tracking screens
  { label: 'fake provider name', pattern: /Mike Rodriguez|Sarah Chen|James Wilson|David Park|Lisa Martinez|Marcus Johnson/ },
  { label: 'random "AID Pro #" provider', pattern: /AID Pro #/ },
  // Mock module and its exports
  { label: 'mock data module', pattern: /mockData|nearbyMechanics|mockNotifications|mockBookingHistory|mockMessages/ },
  { label: 'mock sign-in', pattern: /signInMock/ },
  // Simulated driver matching, chat replies and movement
  { label: 'simulated provider matching', pattern: /matchProviderForBooking|assignProvider\(|initializeProviderTracking|startProviderTracking/ },
  { label: 'simulated chat', pattern: /chatService|scheduleProviderReply|PROVIDER_REPLY_TEMPLATES|PROVIDER_INTRO_TEMPLATES/ },
  // Invented figures and claims
  { label: 'fake promo notification', pattern: /20% Off Your Next Service/i },
  { label: 'unverified availability claim', pattern: /Providers available nearby/i },
  { label: 'hard-coded earnings', pattern: /<strong>\$0\.00<\/strong>/ },
  { label: 'invented receipt fee split', pattern: /estimatedPrice \* 0\.(6|35|05)/ },
  { label: 'seeded recent searches', pattern: /'Flat tire help'/ },
  // B15: ratings come only from the server's ratings table — never a literal or a 0-means-none default.
  { label: 'hard-coded rating value', pattern: /\brating:\s*[0-5](\.\d+)?\b/ },
  // Averages are formatted only by ratingSummary(), which applies MIN_RATINGS_TO_SHOW.
  { label: 'rating shown without the minimum-count check', pattern: /rating\.toFixed\(/, allow: ['./lib/ratings.ts'] },
  { label: 'marketing stats', pattern: /\d[\d,]*\+ (customers|drivers|users|rescues)|4\.9 stars|rated 4\.\d/i },
]

describe('no fake data in production source (F3)', () => {
  it('scans a meaningful set of app files', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50)
    expect(Object.keys(sources)).toContain('./screens/UpdatesScreen.tsx')
  })

  for (const { label, pattern, allow = [] } of FORBIDDEN) {
    it(`has no ${label}`, () => {
      const hits = Object.entries(sources).filter(([file, text]) => !allow.includes(file) && pattern.test(text)).map(([file]) => file)
      expect(hits).toEqual([])
    })
  }

  it('never randomises prices, ratings, ETAs or positions (Math.random only for UI ids)', () => {
    const hits = Object.entries(sources)
      .flatMap(([file, text]) => text.split('\n').map((line, i) => ({ file, line: i + 1, text: line })))
      .filter(({ text }) => /Math\.random\(\)/.test(text) && !/toString\(36\)/.test(text))
      .map(({ file, line }) => `${file}:${line}`)
    expect(hits).toEqual([])
  })
})
