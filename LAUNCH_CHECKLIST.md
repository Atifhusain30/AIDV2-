# AID — Full Launch Checklist

App Store + Google Play launch for AID roadside assistance (individual drivers only at launch).
Updated 2026-10-21. Detailed engineering findings live in `AID_AUDIT_CHECKLIST.md`.

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
| B9 | After accept: both sides see name/photo/vehicle, driver live location on map, ETA | 🛠 | ⬜ |
| B10 | Job lifecycle: en route → arrived → in progress → completed; cancel rules | 🛠 | 🟡 |
| B11 | Real-time status updates on every screen | 🛠 | ⬜ |
| B12 | Real chat customer↔driver + report/block | 🛠 | ⬜ |
| B13 | Calling (masked numbers e.g. Twilio, or direct tel:) | 🤝 | ⬜ |
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
| D5 | Driver vehicle & equipment info (tow truck type, etc.) | 🛠 | ⬜ |
| D6 | Incident reporting + deactivation process | 🤝 | ⬜ |

## E. Security & reliability
| # | Item | Owner | Status |
|---|---|---|---|
| E1 | Database least-privilege + attack test | 🛠 | ✅ |
| E2 | Private document storage, short-lived links | 🛠 | ✅ |
| E3 | Rate limiting, CAPTCHA on sign-up/reset, upload caps | 🛠 | ⬜ |
| E4 | One active request per customer / one job per driver; stale requests expire | 🛠 | ⬜ |
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
