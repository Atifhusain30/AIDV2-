# AID — Full Launch Checklist

App Store + Google Play launch for AID roadside assistance (individual drivers only at launch).
Updated 2026-10-22. Detailed engineering findings live in `AID_AUDIT_CHECKLIST.md`.

**Legend:** ✅ done · 🟡 partial · ⬜ not started · **Owner:** 🛠 dev (assistant) · 👤 you · 🤝 both

---

## A. Business & legal foundation (start now — some take weeks)
| # | Item | Owner | Status |
|---|---|---|---|
| A1 | Business entity (LLC/Corp), EIN, business bank account | 👤 | ✅ |
| A2 | Apple Developer Program **as an organization** (needs D-U-N-S number, ~1–2 weeks) — $99/yr | 👤 | ⬜ |
| A3 | Google Play developer account (organization; identity verification) — $25 one-time | 👤 | ⬜ |
| A4 | Business insurance: general liability + coverage for a marketplace (talk to a broker) | 👤 | ✅ |
| A5 | Driver requirement policy: commercial auto + on-hook/garagekeepers for towing; minimum limits | 👤 | ⬜ |
| A6 | Driver classification decision (independent contractor) + Independent Contractor Agreement | 👤 lawyer | ⬜ |
| A7 | Terms of Service (customer) + Driver Terms + Privacy Policy (lawyer review; I can draft) | 🤝 | ✅ written (in email) — must be published online (I1) |
| A8 | Service area for launch (city/metro) and operating hours | 👤 | ⬜ |
| A9 | Pricing per service, platform fee/driver payout split, cancellation & refund policy | 👤 | 🟡 market prices live (tow $95 incl. 5 mi + $4.50/mi); payout split + cancellation policy open |
| A10 | Domain name (e.g. aidroadside.com) + business email (support@, privacy@) | 👤 | 🟡 domain ✅; support email open |
| A11 | Trademark search for "AID" name/logo | 👤 | ⬜ |
| A12 | Twilio account (business) + A2P 10DLC texting registration (1–3 weeks) — for verification codes, update texts, private calling | 👤 | ⬜ |

## B. Core product (the app must really work end to end)
| # | Item | Owner | Status |
|---|---|---|---|
| B1 | Customer & driver sign-up / sign-in / password reset | 🛠 | ✅ |
| B2 | In-app account deletion (store requirement) | 🛠 | ✅ |
| B3 | Driver onboarding: 4 documents + expiry, submit for review | 🛠 | ✅ |
| B4 | Admin panel: review, approve/reject, verify/suspend, history | 🛠 | ✅ |
| B5 | Request flow: real GPS location, tow drop-off address, real server prices | 🛠 | ✅ |
| B6 | Detailing / Window Tint: "Coming soon" or real scheduling | 🤝 | ✅ Coming soon (revisit after launch) |
| B7 | "Request again" creates a real booking | 🛠 | ✅ |
| B8 | Driver sees nearby requests, accepts (no double-booking) | 🛠 | 🟡 backend ✅, UI polish |
| B9 | After accept: both sides see name/photo/vehicle, driver live location on map, ETA | 🛠 | 🟡 nearly done — server ✅ (3a), driver GPS sharing + job screen ✅ (3b), customer live map + driver name/rating/vehicle/plate + approximate ETA ✅ (3c, `4cfd340`), driver vehicle entry screen ✅ (D5, `eb21ba6` — every driver who can go online now has a vehicle on file, so customers see it). Left: profile photos only (initials shown — no photo upload exists yet). ETA is distance-based (road-mile estimate at 30 mph), not live traffic, until G6. Updates by polling every 4 s; sharing works only while the driver app is open — background tracking comes with G2 |
| B10 | Job lifecycle: en route → arrived → in progress → completed; cancel rules | 🛠 | ✅ `26ceb6e` — one server state machine (`server/lifecycle.js`): driver accepted → en route → arrived → in progress (tow: loaded, heading to drop-off) → completed, one step at a time; wrong party / skipped step / repeat is refused. Customer can cancel until the driver arrives; driver can cancel with a reason until service starts; after that only Complete or Report an issue (both sides). Every change is timestamped and written to `booking_events` with who did it and why. Cancelling or completing frees the driver (one job at a time) and stops location sharing. Driver app: one main button per step with confirm on Complete/Cancel; customer screens show each status and stop tracking at the end; receipt on completion. Proven on the live database (`live-e2e`). No cancellation fee is charged or shown — there is no fee policy yet (A9/C3). Issue reports are saved on the job but there is no admin screen to read them yet |
| B11 | Real-time status updates on every screen | 🛠 | 🟡 customer's active request (status, driver location, ETA, cancel/complete) refreshes every 4 s on every customer screen (polling); driver's active job refreshes every 5 s so a customer cancel ends it on the driver's phone (`26ceb6e`); push (B14) and realtime channel not yet |
| B12 | Real chat customer↔driver + report/block | 🛠 | ⬜ |
| B13 | Calling (masked numbers e.g. Twilio, or direct tel:) | 🤝 | ⬜ real numbers shared during a job for now; Twilio private numbers later |
| B14 | Push notifications (accepted, arriving, completed, new job) | 🛠 | ⬜ needs A2 |
| B15 | Ratings & reviews both directions | 🛠 | ⬜ |
| B16 | Receipts + booking history with real amounts | 🛠 | 🟡 |
| B17 | Driver earnings screen (real data) | 🛠 | ⬜ |
| B18 | Support/help screen + in-app issue reporting | 🛠 | ⬜ |
| B19 | Emergency: remove fake SOS; real "Call 911" (tel:) + safety info | 🛠 | ⬜ **store blocker** |

## C. Payments (Stripe)
| # | Item | Owner | Status |
|---|---|---|---|
| C1 | Stripe account (business verified) + test keys | 👤 | 🟡 account ✅; keys to be entered via hidden-input script |
| C2 | Card hold at request, charge on completion; Apple Pay / Google Pay | 🛠 | ⬜ |
| C3 | Cancellation fees, refunds, disputes handling, webhook hardening | 🛠 | 🟡 |
| C4 | Stripe Connect Express for driver payouts + 1099s | 🤝 | ⬜ |
| C5 | Sales tax review for services in your state | 👤 accountant | ⬜ |

## D. Driver trust & safety
| # | Item | Owner | Status |
|---|---|---|---|
| D1 | Document review by AID admins | 🛠 | ✅ |
| D2 | Automatic block when license/insurance/registration expires | 🛠 | ✅ |
| D3 | Identity + selfie check (Stripe Identity) | 🤝 | ⬜ |
| D4 | Background + motor vehicle record check (Checkr) with FCRA consent | 🤝 | ⬜ |
| D5 | Driver vehicle & equipment info (tow truck type, etc.) | 🛠 | ✅ `eb21ba6` — driver "Vehicle & equipment" screen, reached from onboarding (after documents), the Work screen and Settings: make, model, year (1980–next year), color, license plate + state, and equipment (flatbed / wheel-lift tow truck / light-duty service vehicle). Checked in the app and again on the server, with the problem shown next to the field. A driver without complete vehicle details can't go online, see requests or accept jobs (server-enforced) and is told to add them; going offline always works. Vehicles saved before this need the year, state and equipment added once. New database columns (migration `20261022120000_driver_vehicle_details.sql`) are applied to the current database. Proven on the live database (`live-e2e`). Not yet: equipment is stored but doesn't filter which jobs a driver is offered (e.g. a light-duty vehicle can still see tow requests); admin panel doesn't show the vehicle yet; plate format is checked generally, not per state |
| D6 | Incident reporting + deactivation process | 🤝 | ⬜ |

## E. Security & reliability
| # | Item | Owner | Status |
|---|---|---|---|
| E1 | Database least-privilege + attack test | 🛠 | ✅ |
| E2 | Private document storage, short-lived links | 🛠 | ✅ |
| E3 | Rate limiting, CAPTCHA on sign-up/reset, upload caps | 🛠 | ⬜ |
| E4 | One active request per customer / one job per driver; stale requests expire | 🛠 | 🟡 one job per driver enforced on accept (`26ceb6e`); one active request per customer and expiring stale requests still open |
| E5 | Admin two-factor sign-in (MFA) | 🛠 | ⬜ |
| E6 | Sign-out clears phone data; role from server | 🛠 | 🟡 |
| E7 | Supabase: email confirmation, strong passwords, leaked-password check | 👤 (I'll guide) | ⬜ |
| E8 | Security headers, logging with redaction, audit trail of booking status | 🛠 | ⬜ |
| E9 | Delete test accounts before launch | 🛠 | ⬜ |
| E10 | Backups (Supabase paid plan point-in-time recovery) | 👤 | ⬜ |
| E11 | Final security review / penetration check | 🛠 | ⬜ |

## F. Design & accessibility (Uber/DoorDash quality)
| # | Item | Owner | Status |
|---|---|---|---|
| F1 | Request in 2–3 taps; one bottom-sheet style | 🛠 | ⬜ |
| F2 | One color system (black + restrained purple); remove leftovers | 🛠 | 🟡 |
| F3 | Remove all fake data (fake providers, earnings, notifications) | 🛠 | ⬜ |
| F4 | Accessibility: text size, contrast, screen reader labels, 44pt targets | 🛠 | ⬜ |
| F5 | Empty, loading, error and offline states everywhere | 🛠 | 🟡 |
| F6 | Remove dead code; faster load (lazy maps/payments) | 🛠 | ⬜ |

## G. Platform & store technical requirements
| # | Item | Owner | Status |
|---|---|---|---|
| G1 | App icon + splash screen (iOS + Android incl. monochrome) | 👤 artwork / 🛠 install | ⬜ |
| G2 | iOS permission texts; remove unused (Always location, camera, photo add) | 🛠 | ⬜ |
| G3 | iOS Privacy Manifest (`PrivacyInfo.xcprivacy`), encryption declaration | 🛠 | ⬜ |
| G4 | iPhone-only vs iPad support decision | 🤝 | ⬜ |
| G5 | Android: location permissions, deep links, backup off, target latest API level | 🛠 | ⬜ |
| G6 | Maps & address search from a commercial provider (Mapbox/MapTiler/Google) | 🤝 | ⬜ |
| G7 | Universal Links / App Links on your domain (password reset) | 🛠 | ⬜ needs A10 |
| G8 | Code signing: Apple team + Android upload key (kept safe) | 🤝 | ⬜ |
| G9 | Android Studio + Java installed; Android build tested on device | 🤝 | ⬜ |
| G10 | Test on real iPhone and Android phones (not only simulator) | 👤 | ⬜ |

## H. Infrastructure & operations
| # | Item | Owner | Status |
|---|---|---|---|
| H1 | Host the API (Render/Railway/Fly) at api.yourdomain | 🤝 | ⬜ |
| H2 | Host admin panel (Vercel/Netlify) at admin.yourdomain, protected access | 🤝 | ⬜ |
| H3 | Separate staging and production (Supabase + Stripe + API) | 🛠 | ⬜ |
| H4 | Automatic checks on every push (tests, build) | 🛠 | ⬜ |
| H5 | Crash & error reporting (e.g. Sentry) | 🛠 | ⬜ |
| H6 | Uptime monitoring + alerts | 🛠 | ⬜ |
| H7 | Transactional email from your domain (custom SMTP for Supabase) | 🤝 | ⬜ |
| H8 | Support inbox + response process; admin on-call during launch | 👤 | ⬜ |

## I. Store listings & review
| # | Item | Owner | Status |
|---|---|---|---|
| I1 | Privacy Policy, Terms, Support URLs live on your website | 🤝 | ⬜ |
| I2 | Web page for account deletion requests (Google Play) | 🛠 | ⬜ |
| I3 | App name, subtitle, description, keywords, category (Navigation/Travel) | 🤝 | ⬜ |
| I4 | Screenshots (6.9" & 6.5" iPhone, Android phone) + optional preview video | 🤝 | ⬜ |
| I5 | Apple App Privacy labels + Google Data Safety form | 🤝 | ⬜ |
| I6 | Age rating questionnaires | 👤 | ⬜ |
| I7 | Reviewer demo accounts (customer + verified driver) + review notes explaining the service | 🛠 | ⬜ |
| I8 | Google Play closed test: 12+ testers for 14 days (required for new personal accounts) | 👤 | ⬜ |

## J. Beta & launch
| # | Item | Owner | Status |
|---|---|---|---|
| J1 | TestFlight internal beta | 🤝 | ⬜ |
| J2 | Recruit 5–10 real drivers in launch area; verify them | 👤 | ⬜ |
| J3 | Real-world test jobs (friends & family) incl. payments and payouts | 👤 | ⬜ |
| J4 | Fix beta issues | 🛠 | ⬜ |
| J5 | Submit to App Store + Google Play | 🤝 | ⬜ |
| J6 | Launch-day plan: monitoring, support coverage, driver supply in area | 👤 | ⬜ |
| J7 | Marketing: website landing page, social, local outreach | 👤 | ⬜ |

## K. After launch
- Watch crash reports, reviews, and support tickets daily for the first 2 weeks.
- Business providers (towing companies with multiple drivers) — deferred.
- Scheduled services (detailing, tint) if marked "Coming soon".
- Analytics on request → completion funnel.

---

## Critical path (what blocks launch soonest)
1. **You, now:** A1 business entity → A2 Apple org account (D-U-N-S takes ~1–2 weeks) → A3 Google account; C1 Stripe account; A10 domain.
2. **Dev, now:** B5–B11 core flow → E3–E6 protection → C2–C4 payments → B12–B14 communication.
3. **Then:** G (store tech) + F (polish) → H (hosting) → I (listings) → J (beta → submit).
