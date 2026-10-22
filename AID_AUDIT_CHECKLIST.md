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
| 1.5 | After acceptance customer gets no driver name/phone/vehicle/live location; driver sees "Customer" with no contact, notes or tow destination | ✅ server cards (3a); driver job screen (3b); customer tracking screen with live map, stale-location warning, approximate server ETA, call button (3c `4cfd340`); driver vehicle & equipment screen, required before going online (D5 `eb21ba6`). Gap: no profile photos |
| 1.6 | Driver app never captures/uploads GPS during a job (`watchLocation` never called) | ✅ app-wide `useJobLocationSharing` (throttled, stops when job ends); foreground only for now |
| 1.7 | Release builds silently default API to `127.0.0.1`; Android CORS origin `https://localhost` missing | ⚠️ Android origin `https://localhost` (and `ionic://localhost`, dev `:3000`) now in the server's default allowlist and the env examples (`136543c`) — an existing `server/.env` with its own `CORS_ORIGIN` must add it; release API URL default still open |

## Phase 2 — Security & backend hardening
| # | Item | Status |
|---|---|---|
| 2.1 | Least-privilege database grants + live attack test | ✅ fixed |
| 2.2 | Rate limiting (IP + user), CAPTCHA on sign-up/reset, upload caps | ⚠️ rate limits + upload caps ✅ `136543c` — shared limiter `server/rateLimit.js` (fixed window, store interface `hit(key, windowMs)`; in-memory = single instance only, resets on restart): global 600/min per IP (`/health` exempt); per user: booking create 20/h, quotes 120/h, accept 30/10 min, status 60/10 min, driver location + request list 60/min, document uploads 20/h, ratings 20/h, reports 20/h (DB rule 10/h kept), chat sends 60/min (DB rule 30/min kept), blocks 10/h, profile/vehicle/document changes 60/h; 429 + `Retry-After` + JSON `code: rate_limited` (DB rules keep their codes and now send Retry-After). `TRUST_PROXY` off by default ("true" = 1 hop). Test: 1 h of customer+driver polling on one IP, chat open → zero 429; live e2e → zero 429. Uploads: 10 MB (`DOCUMENT_MAX_MB`) → 413, MIME allowlist + magic bytes; JSON 100 KB → 413, malformed → 400. CAPTCHA ❌ 🔒 needs hCaptcha/Turnstile keys in the Supabase dashboard + widget on sign-up/reset screens |
| 2.3 | One active booking per customer; one active job per driver; expire unaccepted requests | ✅ `80f720a` — server pre-check (409 `active_request_exists` / `driver_busy`) backed by partial unique indexes (`bookings_one_active_per_customer`, `bookings_one_active_job_per_driver`, migration `20261022200000`, applied to the current database); unaccepted requests → new status `expired` after `REQUEST_EXPIRY_MINUTES` (default 15); accepted/en-route jobs with no driver location or status for `STALE_JOB_MINUTES` (default 60) → cancelled by `system` (`driver_unresponsive`); audited in `booking_events` (actor null, role system); run on every read/create + 60 s sweep (`server/expiry.js`); overdue requests are never listed or acceptable even before the sweep. Proven on the live database (concurrent creates, expiry, sweep, silent-driver release, DB refuses a second active row). Gaps: no push notification when a request expires (B14); with no background location (G2) a driver who keeps AID closed for 60 min on the way loses the job; admin panel doesn't list expired/released jobs |
| 2.4 | Admin accounts require MFA (TOTP) | ❌ |
| 2.5 | Payment: pre-authorize at booking (manual capture), capture on completion; customer confirmation of completion | ❌ |
| 2.6 | Stripe webhook: dedupe event ids, verify amount/booking, handle refunds/disputes, 500 on DB errors; reuse/cancel stale intents | ⚠️ |
| 2.7 | Verification: atomic readiness check; rejecting an approved doc of a verified driver must suspend/recompute | ⚠️ revoke → offline fixed `7e3bb83`; atomic check open |
| 2.7b | Drivers can always go offline (even after credentials lapse) | ✅ `04ba223`; still true with the D5 vehicle requirement — a driver with no/incomplete vehicle can go offline but not online (`eb21ba6`, tested) |
| 2.7c | Sign-out and wrong-portal rejection affect only this device (password change still global) | ✅ `7e3bb83` |
| 2.7d | Drivers can only see and accept jobs their equipment can do (no tows for light-duty vehicles; electric cars on flatbeds only) | ✅ `da1111a` — enforced on the server for both the request list and accept (also inside the accept update), tested for each equipment type and on the live database. Electric-car rule depends on customers marking the car electric, which no app screen does yet |
| 2.7e | Drivers only see and accept requests near them (not every open request in the system) | ✅ `118ee02` — 25-mile radius (setting `DRIVER_REQUEST_RADIUS_MILES`) from the driver's current location, enforced on the server for the list and for accept; no location → nothing listed and accept refused; bad coordinates (out of range, 0,0) refused; the driver's location is kept only 10 minutes and erased on going offline; list still shows only an approximate pickup area. Tested in server and app tests and on the live database |
| 2.7f | Ratings both directions are server-owned: only a completed job's own customer/driver, once each, within 7 days, never yourself; private notes visible to admins only | ✅ `9d8a63e` — `server/ratings.js` (rules + tag lists), `POST /api/bookings/:id/rating`, `GET /api/ratings/pending`; table `ratings` (migration `20261023000000`, applied to the current database) with `unique (booking_id, rater_id)`, `rater_id <> ratee_id`, stars 1–5, note ≤ 500; RLS on, no client grants (live attack test proves apps can't insert/read); the insert re-checks completed + participants + window itself. Averages computed on read from an index (`ratings_ratee_idx`); shown to customers/drivers only from 3 ratings, admins see the true average + recent low ratings with notes. Proven on the live database (both directions, duplicate refused by the database, window, aggregate, notes never in participant responses) |
| 2.8 | Account deletion: keep (anonymize) paid bookings for records; handle auth-delete failure; let suspended users delete; sweep storage prefix | ⚠️ |
| 2.9 | Auth settings for production: email confirmation, secure password change, stronger password rules + leaked-password check | 🔒 Supabase dashboard |
| 2.10 | Input validation gaps (UUID params, drop-off address length, lat/lng ranges); status route ignores credential expiry | ⚠️ |
| 2.11 | Security headers, structured logging with redaction, booking status audit trail (`booking_events` unused) | ✅ audit trail done `26ceb6e` (every accept/status change/cancel reason/issue report written atomically to `booking_events`; job issue reports also land in `support_reports` since B18 `5f2f559`; blocks are recorded as `user_blocked` since B12 `3eda4fa`); security headers + structured logging ✅ `136543c`: hand-rolled headers (`server/security.js`) — CSP `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`, nosniff, X-Frame-Options DENY, Referrer-Policy no-referrer, COOP/CORP same-origin, Cache-Control no-store, no X-Powered-By, HSTS only with `HSTS_ENABLED=true`; CORS allowlist from `CORS_ORIGIN` (unlisted origins → 403, no-Origin requests allowed); JSON request logs (method, route pattern, status, duration, request id, user id/role, IP /24) with redaction (`server/redact.js`: auth headers/tokens/keys/passwords, emails, phones, addresses, names, message/note text, coordinates rounded to 2 dp; free text scrubbed for JWTs, keys, emails, phones, coordinate pairs); X-Request-Id on every response; 500s → generic message + request id, redacted stack logged; JSON 404 for unknown routes. Gap: no log shipping/alerting |
| 2.12 | Clear persisted data on logout (previous user's vehicles/history visible); mark driver offline on logout | ❌ |
| 2.13 | Client routes by editable `user_metadata.role`; should use `/api/me` (admin sign-in shows blank screen) | ⚠️ |

## Phase 3 — Real-time experience
| # | Item | Status |
|---|---|---|
| 3.1 | Real customer↔driver chat with report/block (currently simulated auto-replies) | ✅ `3eda4fa` (B12) — real text chat between a job's customer and assigned driver from the tracking / job screen, unread count on the booking poll, sending / not sent + retry; server allows only the two participants, only while accepted → in service, read-only 24 h after the job ends then hidden from the apps (kept for admins), 1–1000 characters, 30/min per person, no phone/email/id in messages; report from chat opens the B18 form prefilled; block closes the chat and keeps the pair apart in the request list, accept and the database accept, never cancels the job; admins read a reported job's chat; `job_messages` / `user_blocks` RLS on, no client privileges. No unblock in the apps, no push for new messages (3.4) |
| 3.2 | Call buttons (masked numbers or `tel:`) | ❌ console.log only |
| 3.3 | Status updates everywhere (not only while Chat screen is open); driver job refresh when customer cancels | ✅ by polling — customer every 4 s on every screen (`4cfd340`), driver's active job every 5 s with a "customer cancelled" notice (`26ceb6e`); realtime channel/push still 3.4 |
| 3.4 | Push notifications (APNs/FCM) for request accepted, arriving, completed, new job for drivers | ❌ |
| 3.5 | Lifecycle buttons only in allowed states (customer cancel after en route; driver cancel after arrival) | ✅ `26ceb6e` — server state machine `server/lifecycle.js` + client mirror `src/lib/jobLifecycle.ts`; customer cancels until arrival, driver (with reason) until service starts, then report-an-issue only |
| 3.6 | Payment status re-read after paying; receipt shows real price (no invented distance/surge split) | ⚠️ receipt now shows only the server's price (`57b303e`); payment status re-read still pending |
| 3.7 | Prices shown come from the server catalog (`GET /api/services`), not local/random estimates | ✅ `bbf9c8c` request flow; receipts still pending (3.6) |
| 3.8 | Help & Support screen + in-app issue reporting (job-linked and general) that an admin can actually read and resolve | ✅ `5f2f559` — Help & Support (FAQ, Report a problem, My reports) in both apps; job "Report an issue" uses the same flow; one `support_reports` table (RLS on, no client privileges, category list per role enforced by the database, message ≤ 2000) plus an append-only admin trail `support_report_events`; B10 job reports migrated in; API checks job participation and 10 reports/person/hour; admin Reports inbox with status/category filters, safety highlighted, linked job + both parties, status changes and internal notes. Reporter isn't notified of changes (needs push, 3.4); no admin alert on new reports |

## Phase 4 — UI/UX polish (Uber/DoorDash benchmark)
| # | Item | Status |
|---|---|---|
| 4.1 | 2-tap request: tile → review → "Request · $X" (today 8 taps, service asked twice, fake 1.5 s delays) | ❌ |
| 4.2 | One bottom-sheet component above the nav (6 different modal designs today; nav stays tappable behind modals) | ❌ |
| 4.3 | One color system: black + restrained purple; remove emerald/teal/lime/navy/blue leftovers and ~30 `!important` overrides | ❌ |
| 4.4 | Remove fake data: "1" notification promo, random providers, "Downtown District", hard-coded driver earnings, "providers nearby", "technician on their way" | ✅ `57b303e` — mock data file, random provider matching, simulated chat/tracking, promo notification and badge, seeded searches, invented receipt fee split, "Providers available nearby", hard-coded "$0.00"/"0" driver stats and dead driver bell removed; "Downtown District" and "technician on their way" were already gone. Driver Today uses real job history; earnings say "Soon". Guarded by `src/noFakeData.test.ts`. Ratings are now real (`9d8a63e`, B15): the test also forbids hard-coded rating values and any rating display that skips the 3-rating minimum |
| 4.5 | Accessibility: dialog roles/focus trap/Escape, labelled icon buttons, 44 pt targets, text ≥ 12 px, contrast ≥ 4.5:1, allow pinch-zoom, reduced motion, remove confetti | ❌ |
| 4.6 | Consistent terminology: "provider" (customer side) / "driver" (driver app) | ⚠️ |
| 4.7 | Driver home: one clear "Finish verification" CTA, time-based greeting, working bell, service icons | ⚠️ time-based greeting done and the non-working bell removed (`57b303e`); service icons remain |
| 4.8 | Chat/keyboard layout (`100dvh`, safe area), back navigation | ⚠️ the new job chat (B12 `3eda4fa`) is full-screen at `100dvh` with safe-area padding, a composer that stays above the keyboard (Capacitor Keyboard resizes the body), 44 px+ targets, a back button and Escape to close; not yet checked on a real phone, and app-wide back navigation (Android back button) is still open |
| 4.9 | Replace `window.alert` with inline errors/toasts; vehicle year validation | ❌ |
| 4.10 | Remove dead code (~2,700 lines unused UI kit, ActiveServiceScreen, MapView, ~42 unused CSS classes); lazy-load maps/Stripe/driver app | ❌ ActiveServiceScreen, EmergencySOSModal and `.emergency-panel` CSS removed in `bd1c4d7`; MapView, TrackingMap, HistoryModal, chatService, mockData and the demo simulation in bookingService/ChatScreen removed in `57b303e` (~2,300 lines); unused `DriverAvatar`/`ProviderCard` (showed a rating without the minimum) removed in `9d8a63e`; rest of the unused UI kit, unused CSS and lazy-loading remain |

## Phase 5 — App Store & Google Play
| # | Item | Status |
|---|---|---|
| 5.1 | **Emergency SOS is fake** ("Call 911" shows success without calling) — remove or make `tel:911` real; fix dead "Roadside support" buttons | ✅ `bd1c4d7` — fake SOS modal deleted; real Call 911 (`tel:911`, confirm step first) + Safety sheet ("AID is not an emergency service…") on customer tracking, driver job, customer Account, driver Settings and Home; dead "Roadside support" (Account) and "Support" (booking details) buttons removed; Report an issue labelled non-emergency. Tests guard against fake SOS text returning |
| 5.2 | Privacy Policy, Terms, Support pages published + linked in app and at sign-up; web account-deletion URL (Play) | ❌ 🔒 in-app Help & Support exists (B18 `5f2f559`), but the public Support web page (App Store support URL), Privacy Policy and Terms are not published yet; support email waits on A10 |
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
