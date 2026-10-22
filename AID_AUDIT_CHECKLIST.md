# AID V2 — Full Audit Checklist

Audited 2026-10-21 on `auth-foundation` (4 independent reviews: wiring, security, store readiness, UI/UX) plus build checks.
Scope: individual providers only (business providers deferred).

Legend: ✅ done · ⚠️ partial · ❌ missing/broken · 🔒 needs owner action outside code

## Already fixed during the audit
- ✅ **CRITICAL — privilege escalation closed.** Any signed-in user could set `profiles.role='admin'` using the public app key (Supabase auto-grants). Migration `20261021230000_least_privilege_grants.sql` revokes all client grants, re-grants minimum column-level access, adds a trigger guarding role/status, and `server/test/live-rls.test.js` proves the attack now fails.

## Build health
- ✅ Client tests 36/36, TypeScript clean, production build OK
- ✅ Server tests 43/43, live end-to-end flow + live attack test pass
- ✅ Capacitor 8.5.3 aligned; iOS builds/installs/launches in simulator
- ⚠️ Main JS bundle 644 kB (Leaflet, Stripe, Supabase, all modals load up front)
- ❌ Android never compiled (no JDK/Android SDK on this Mac); Android web bundle is stale
- ❓ Dependency vulnerability scan could not reach the registry

---

## Phase 1 — Broken core flows (Critical)
| # | Item | Status |
|---|---|---|
| 1.1 | Driver onboarding: collect all 4 docs with expiration dates, call submit, show review status/reasons (`DriverOnboardingScreen`, `services/documents.ts`) | ✅ `04ba223` |
| 1.1b | Admin review panel (separate site, `admin/`): queue, search, document review with reasons, verify/suspend/reinstate, history | ✅ `704eb9c`, redesigned `7e3bb83` |
| 1.2 | Towing & EV use a hard-coded Dallas location; drop-off coordinates never set | ✅ `bbf9c8c` one RequestSheet, confirmed location, tow drop-off from address search, server requires drop-off |
| 1.3 | Detailing & Window Tint show "Booked!" without creating a booking | ✅ `bbf9c8c` "Coming soon"; server rejects (409) |
| 1.4 | "Request again"/Rebook creates a local-only phantom booking (`rebookFromHistory`) | ✅ `bbf9c8c` reopens sheet prefilled; server creates booking |
| 1.5 | After acceptance customer gets no driver name/phone/vehicle/live location; driver sees "Customer" with no contact, notes or tow destination | ❌ |
| 1.6 | Driver app never captures/uploads GPS during a job (`watchLocation` never called) | ❌ |
| 1.7 | Release builds silently default API to `127.0.0.1`; Android CORS origin `https://localhost` missing | ❌ |

## Phase 2 — Security & backend hardening
| # | Item | Status |
|---|---|---|
| 2.1 | Least-privilege database grants + live attack test | ✅ fixed |
| 2.2 | Rate limiting (IP + user), CAPTCHA on sign-up/reset, upload caps | ❌ |
| 2.3 | One active booking per customer; one active job per driver; expire unaccepted requests | ❌ |
| 2.4 | Admin accounts require MFA (TOTP) | ❌ |
| 2.5 | Payment: pre-authorize at booking (manual capture), capture on completion; customer confirmation of completion | ❌ |
| 2.6 | Stripe webhook: dedupe event ids, verify amount/booking, handle refunds/disputes, 500 on DB errors; reuse/cancel stale intents | ⚠️ |
| 2.7 | Verification: atomic readiness check; rejecting an approved doc of a verified driver must suspend/recompute | ⚠️ revoke → offline fixed `7e3bb83`; atomic check open |
| 2.7b | Drivers can always go offline (even after credentials lapse) | ✅ `04ba223` |
| 2.7c | Sign-out and wrong-portal rejection affect only this device (password change still global) | ✅ `7e3bb83` |
| 2.8 | Account deletion: keep (anonymize) paid bookings for records; handle auth-delete failure; let suspended users delete; sweep storage prefix | ⚠️ |
| 2.9 | Auth settings for production: email confirmation, secure password change, stronger password rules + leaked-password check | 🔒 Supabase dashboard |
| 2.10 | Input validation gaps (UUID params, drop-off address length, lat/lng ranges); status route ignores credential expiry | ⚠️ |
| 2.11 | Security headers, structured logging with redaction, booking status audit trail (`booking_events` unused) | ❌ |
| 2.12 | Clear persisted data on logout (previous user's vehicles/history visible); mark driver offline on logout | ❌ |
| 2.13 | Client routes by editable `user_metadata.role`; should use `/api/me` (admin sign-in shows blank screen) | ⚠️ |

## Phase 3 — Real-time experience
| # | Item | Status |
|---|---|---|
| 3.1 | Real customer↔driver chat with report/block (currently simulated auto-replies) | ❌ |
| 3.2 | Call buttons (masked numbers or `tel:`) | ❌ console.log only |
| 3.3 | Status updates everywhere (not only while Chat screen is open); driver job refresh when customer cancels | ❌ |
| 3.4 | Push notifications (APNs/FCM) for request accepted, arriving, completed, new job for drivers | ❌ |
| 3.5 | Lifecycle buttons only in allowed states (customer cancel after en route; driver cancel after arrival) | ⚠️ |
| 3.6 | Payment status re-read after paying; receipt shows real price (no invented distance/surge split) | ⚠️ |
| 3.7 | Prices shown come from the server catalog (`GET /api/services`), not local/random estimates | ✅ `bbf9c8c` request flow; receipts still pending (3.6) |

## Phase 4 — UI/UX polish (Uber/DoorDash benchmark)
| # | Item | Status |
|---|---|---|
| 4.1 | 2-tap request: tile → review → "Request · $X" (today 8 taps, service asked twice, fake 1.5 s delays) | ❌ |
| 4.2 | One bottom-sheet component above the nav (6 different modal designs today; nav stays tappable behind modals) | ❌ |
| 4.3 | One color system: black + restrained purple; remove emerald/teal/lime/navy/blue leftovers and ~30 `!important` overrides | ❌ |
| 4.4 | Remove fake data: "1" notification promo, random providers, "Downtown District", hard-coded driver earnings, "providers nearby", "technician on their way" | ❌ |
| 4.5 | Accessibility: dialog roles/focus trap/Escape, labelled icon buttons, 44 pt targets, text ≥ 12 px, contrast ≥ 4.5:1, allow pinch-zoom, reduced motion, remove confetti | ❌ |
| 4.6 | Consistent terminology: "provider" (customer side) / "driver" (driver app) | ⚠️ |
| 4.7 | Driver home: one clear "Finish verification" CTA, time-based greeting, working bell, service icons | ⚠️ |
| 4.8 | Chat/keyboard layout (`100dvh`, safe area), back navigation | ❌ |
| 4.9 | Replace `window.alert` with inline errors/toasts; vehicle year validation | ❌ |
| 4.10 | Remove dead code (~2,700 lines unused UI kit, ActiveServiceScreen, MapView, ~42 unused CSS classes); lazy-load maps/Stripe/driver app | ❌ |

## Phase 5 — App Store & Google Play
| # | Item | Status |
|---|---|---|
| 5.1 | **Emergency SOS is fake** ("Call 911" shows success without calling) — remove or make `tel:911` real; fix dead "Roadside support" buttons | ❌ top rejection risk |
| 5.2 | Privacy Policy, Terms, Support pages published + linked in app and at sign-up; web account-deletion URL (Play) | ❌ 🔒 |
| 5.3 | Real app icon + splash (both platforms use Capacitor defaults); Android monochrome icon | ❌ 🔒 design assets |
| 5.4 | iOS permissions: remove "Always" location, Camera, Photo Library Add strings (unused) | ❌ |
| 5.5 | iOS `PrivacyInfo.xcprivacy`, `ITSAppUsesNonExemptEncryption=false`, `arm64` capability, versions from build settings | ❌ |
| 5.6 | iPad: drop iPad support or test it (currently declared with all orientations) | ⚠️ decision |
| 5.7 | Android: location permissions, `com.aid.roadside` deep-link intent filter, remove `SCHEDULE_EXACT_ALARM`, `allowBackup=false`, narrow FileProvider paths | ❌ |
| 5.8 | Maps/geocoding: move off public OpenStreetMap tiles/Nominatim (policy forbids commercial app use/autocomplete) | ❌ 🔒 provider account |
| 5.9 | Remove developer text ("Add VITE_GOOGLE_MAPS_API_KEY…"), `vite.svg` | ❌ |
| 5.10 | Reviewer accounts: customer + pre-verified driver + safe test booking path | ❌ |
| 5.11 | App Privacy labels / Play Data Safety (location, contact info, ID documents, payments) | ❌ 🔒 |
| 5.12 | Signing: Apple team ID, Android upload keystore + release signing | ❌ 🔒 |
| 5.13 | Stripe for real-world services (allowed outside In-App Purchase) | ✅ |
| 5.14 | In-app account deletion | ✅ |

## Phase 6 — Launch operations
- ❌ Host the API (HTTPS, domain), staging vs production environments, secrets management
- ❌ CI: tests, types, build, audits, iOS/Android builds
- ❌ Crash reporting (after privacy review)
- ❌ Install Android Studio/JDK; compile and test Android
- ❌ TestFlight + Play closed testing

## Already solid
- Server-owned identity, roles, prices, payment amounts; parameterized SQL; ownership checks on every query
- Atomic job acceptance; drivers see only approximate pickup before accepting
- Private document storage with 15-minute links and file-signature checks
- Driver verification review flow with audit log and automatic expiry blocking
- Device sessions in Keychain/Keystore; PKCE password recovery; in-app account deletion
- Database connection over verified TLS
