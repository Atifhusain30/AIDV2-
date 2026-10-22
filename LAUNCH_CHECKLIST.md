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
| B8 | Driver sees nearby requests, accepts (no double-booking) | 🛠 | ✅ `118ee02` — an online driver sees only open requests within 25 miles of where they are now (server-enforced; setting `DRIVER_REQUEST_RADIUS_MILES`, 1–100), nearest first, each showing its distance ("3.2 mi away"), and only jobs their equipment can do (`da1111a`, see D5); at most 50. The driver app sends its location with each refresh (every 30 s while online on the Work screen, one low-power reading — no constant tracking); the server keeps it for 10 minutes and forgets it when the driver goes offline. With no location the app says "Turn on location to see nearby requests" (with Try again) instead of listing anything; with none nearby it says "No requests near you right now". Accepting a job more than 25 miles away, or with no known location, is refused with the reason; two drivers can still never take the same job, and a driver can't hold two jobs. Proven on the live database (`live-e2e`: near request listed with its distance, an Austin request hidden and refused from Dallas but listed for a driver near it). New database column (migration `20261022180000_driver_current_location_at.sql`) applied to the current database. Limits: distance is the same estimate as pricing (straight line × 1.25), not real driving distance, until G6; the list refreshes only while the driver app is open (background location with G2; new-job alerts with B14) |
| B9 | After accept: both sides see name/photo/vehicle, driver live location on map, ETA | 🛠 | 🟡 nearly done — server ✅ (3a), driver GPS sharing + job screen ✅ (3b), customer live map + driver name/rating/vehicle/plate + approximate ETA ✅ (3c, `4cfd340`), driver vehicle entry screen ✅ (D5, `eb21ba6` — every driver who can go online now has a vehicle on file, so customers see it). Left: profile photos only (initials shown — no photo upload exists yet). ETA is distance-based (road-mile estimate at 30 mph), not live traffic, until G6. Updates by polling every 4 s; sharing works only while the driver app is open — background tracking comes with G2 |
| B10 | Job lifecycle: en route → arrived → in progress → completed; cancel rules | 🛠 | ✅ `26ceb6e` — one server state machine (`server/lifecycle.js`): driver accepted → en route → arrived → in progress (tow: loaded, heading to drop-off) → completed, one step at a time; wrong party / skipped step / repeat is refused. Customer can cancel until the driver arrives; driver can cancel with a reason until service starts; after that only Complete or Report an issue (both sides). Every change is timestamped and written to `booking_events` with who did it and why. Cancelling or completing frees the driver (one job at a time) and stops location sharing. Driver app: one main button per step with confirm on Complete/Cancel; customer screens show each status and stop tracking at the end; receipt on completion. Proven on the live database (`live-e2e`). No cancellation fee is charged or shown — there is no fee policy yet (A9/C3). Issue reports now go to the admin Reports inbox (B18, `5f2f559`) |
| B11 | Real-time status updates on every screen | 🛠 | 🟡 customer's active request (status, driver location, ETA, cancel/complete) refreshes every 4 s on every customer screen (polling); driver's active job refreshes every 5 s so a customer cancel ends it on the driver's phone (`26ceb6e`); push (B14) and realtime channel not yet |
| B12 | Real chat customer↔driver + report/block | 🛠 | ✅ `3eda4fa` — once a driver accepts, the customer (tracking screen) and the driver (job screen) each have a **Message** button with a red unread count, and can text each other: message bubbles with times, "Sending…", "Not sent" with **Retry** (a retried message is saved only once), an empty state ("No messages yet — your phone number and email aren't shown"), full-screen chat that stays above the keyboard. Every message was typed by one of the two people — there are no automatic or canned replies (a test forbids them). **Rules (server-checked, database-backed):** only the job's own customer and its assigned driver can read or send (anyone else is told the job doesn't exist); sending only while the job is accepted / on the way / arrived / in service; after it's completed or cancelled the chat is **read-only for 24 hours** (customers reopen it from Activity → job details) and then disappears from the apps — AID keeps it for admins. Text only, 1–1000 characters (control characters removed), **30 messages a minute** per person. Messages never carry either person's phone number, email or account id (what people type themselves is sent as typed). New messages are checked every 3 s while the chat is open; otherwise the unread count rides on the normal booking check (every 4 s customer / 5 s driver) — no extra requests, no realtime channel yet. **Report:** "Report [name]" in the chat menu opens the existing report form (B18) for this job with "Driver behaviour" / "Customer behaviour" already chosen. **Block:** "Block [name]" asks first, then closes the chat for both people and, from then on, that driver never sees that customer's requests and can't accept them (checked in the request list, in accept, and again inside the database accept); it works either way round and on any of your jobs with an assigned driver, also after the job. Blocking **never cancels the job** — the app says what to do instead (cancel under the B10 rules, or report it; call 911 if in danger), and the blocked person just sees "Chat is closed for this job". Each block is recorded on the job's history. **Admin:** a report about a job now shows "Chat on this job" — every message with who sent it and when, and any block between the two people. New tables `job_messages` and `user_blocks`: apps can't read or write them directly (API only). Tested: server rules (outsiders refused, wrong job state, read-only window then hidden, rate limit, retry stored once, privacy, block effects on the request list and accept, admin-only thread), the apps (send/retry, unread badge, blocked and read-only states, report prefill, block confirm) and the live database (messages both ways, outsider refused, read-only then hidden after 24 h, admin thread from a report, a block during an active job doesn't cancel it, and the blocked customer's next request is hidden from that driver and accept is refused). Limits: **no unblock** in the apps yet (AID support would remove it in the database — not needed for launch); no push notification for a new message (B14), so the other person only sees it when their app is open; no photos, voice or read receipts in the UI; drivers can't reopen a finished job's chat (there's no driver job-details screen yet); checked in a phone-width browser preview with real test accounts, not yet on a real iPhone/Android |
| B13 | Calling (masked numbers e.g. Twilio, or direct tel:) | 🤝 | ⬜ real numbers shared during a job for now; Twilio private numbers later |
| B14 | Push notifications (accepted, arriving, completed, new job) | 🛠 | ⬜ needs A2 |
| B15 | Ratings & reviews both directions | 🛠 | ✅ `9d8a63e` — after a completed job the customer rates the driver and the driver rates the customer: 1–5 stars, optional tags (customer → driver: On time, Professional, Careful with vehicle, Friendly; driver → customer: Clear location, Ready on arrival, Respectful) and an optional private note (up to 500 characters) that only the AID team sees — the person rated never sees it. **Rules (server-checked, database-backed):** only the job's own customer or driver, only once the job is completed, once each (the database refuses a second), within **7 days** of completion, never yourself; apps can't read or write ratings directly. **Showing ratings:** an average appears only once someone has **3 ratings** (one or two ratings swing it too much to be fair); before that it says "New on AID". Customers see the driver as "★ 4.8 (12) · 30 jobs" on live tracking and booking details; drivers see their real rating on Work → Today with "Your rating shows once 3 customers have rated you (1 so far)" until then; drivers see a customer's rating on the job card (same rule). The job count is now the driver's real completed jobs. **Asking:** the customer gets the rating sheet on the receipt right after the job (Skip leaves a "Rate [driver]" button on the receipt until the 7 days run out); the driver gets it right after tapping Complete; a skipped or missed rating is asked once more the next time the app opens ("Not now" ends it). Admin driver page shows the true average, count and recent low ratings (2★ or less) with their notes. Tested: server rules (non-participant, not completed, duplicate incl. two at once, 7-day window, validation, averages, notes never in customer/driver answers), the apps (sheet submit/skip, keyboard + screen-reader stars, reminder once, 3-rating minimum) and the live database (both directions, average 4.0 after 3 ratings, notes only for admins, apps can't insert ratings). Limits: checked in a phone-width browser preview only (not yet on a real phone); "asked once more" is remembered per phone, so a second phone may ask again; Today's rating refreshes when the app opens; no push reminder (B14); reporting/blocking a person stays B12 |
| B16 | Receipts + booking history with real amounts | 🛠 | 🟡 history comes from the server; receipts now show only the server's price (no invented fee split) and the real driver (`57b303e`); not yet: an itemised breakdown from the server, tips, emailed/PDF receipts |
| B17 | Driver earnings screen (real data) | 🛠 | ⬜ Work → Today shows jobs completed today from real job history; Earnings says "Soon" (no made-up amounts — the job price is what the customer pays, not the driver's pay, and payouts don't exist yet) (`57b303e`) |
| B18 | Support/help screen + in-app issue reporting | 🛠 | ✅ `5f2f559` — **Help & Support** for customers (Account → Help & safety → Help & Support) and drivers (Settings → Help & Support): short answers about how AID works today (how a request works, cancel rules, the 15-minute expiry and 60-minute silent-driver release, ratings, getting approved and which requests drivers see, what happens after a report, and "AID is not an emergency service — call 911") plus Safety/Call 911. **Report a problem**: pick what it's about from a fixed list for your side (customers: Driver behaviour, Damage to my vehicle, Pricing or charge, Service wasn't completed, App problem, Safety concern (non-emergency), Other; drivers: Customer behaviour, Payment or earnings, Damage to my vehicle or equipment, Service couldn't be completed, App problem, Safety concern (non-emergency), Other), optionally one of your 10 most recent jobs, and what happened (up to 2000 characters); the form says it's not for emergencies and ends on "Report sent" (with Call 911 for safety reports). **My reports** lists each report as Received, In review or Resolved. **Report an issue** on an active job uses the same form and the same table, so every report is in one place. Server rules: you can only attach your own job (anyone else's looks like it doesn't exist), categories are checked against your side's list (the database repeats the check), 10 reports per person per hour, the reporter never sees the AID team's notes, and the apps can't read or write the reports table directly (API only). The job issue reports saved by B10 are copied into the new table by the migration (there were none on the dev database). **Admin → Reports**: count of reports needing attention in the sidebar (red when one is a safety report), filter by status (Needs attention / Open / In review / Resolved / All) and category, safety reports highlighted and listed first; a report shows the message, the linked job (service, status now and when reported, pickup/drop-off, price) with both customer and driver and their contact details, and the reporter; the admin moves it open → in review → resolved (or reopens it) and adds internal notes, all kept as a history. Proven on the live database (`live-e2e`, `live-rls`). Limits: no support email or phone is shown until one exists (set `SUPPORT_EMAIL` / `SUPPORT_PHONE` on the server — see A10); the reporter isn't notified when the status changes (only shown in My reports — needs B14) and there's no reply/chat in the app; AID admins aren't alerted when a report arrives (they check the inbox); no photo attachments; checked in a phone-width browser preview only, not yet on a real iPhone/Android |
| B19 | Emergency: remove fake SOS; real "Call 911" (tel:) + safety info | 🛠 | ✅ `bd1c4d7` — the fake "Emergency SOS" (countdown, then "Connecting to 911… help is on the way", "priority tow truck dispatched", "emergency contact notified" — none of it real; it was no longer mounted, so the buttons that opened it did nothing) is deleted, along with the unused tracking screen that had an Emergency button. Now: a **Call 911** button that always asks "Call 911?" first, then opens the phone dialer (`tel:911`); on a computer the number 911 is shown to dial from any phone. It's on the customer tracking screen, the driver job screen, customer Account → Help & safety → Safety, driver Settings → Safety, and the Safety link at the bottom of Home. The **Safety** sheet says plainly "AID is not an emergency service and does not contact 911, police or medical help for you" and gives short tips (call 911 if in danger; get away from traffic; on a highway shoulder stay in the car, seatbelt on, hazards on; check the driver's name, vehicle and plate in the app — drivers get their own tips). No "share trip" tip because that feature doesn't exist. Report an issue stays separate and now says it's not for emergencies (reports are reviewed later). The dead "Roadside support"/"Support" buttons that opened the fake SOS are gone and Home no longer claims "Help is available 24/7". No crash detection or share-location-with-911 claims exist. Tested: no fake SOS text left in the code, the only `tel:911` link is behind the confirm step, and Safety opens from every entry point. Checked in a phone-width browser preview only — dialing not yet tried on a real iPhone/Android |

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
| D5 | Driver vehicle & equipment info (tow truck type, etc.) | 🛠 | ✅ `eb21ba6` — driver "Vehicle & equipment" screen, reached from onboarding (after documents), the Work screen and Settings: make, model, year (1980–next year), color, license plate + state, and equipment (flatbed / wheel-lift tow truck / light-duty service vehicle). Checked in the app and again on the server, with the problem shown next to the field. A driver without complete vehicle details can't go online, see requests or accept jobs (server-enforced) and is told to add them; going offline always works. Vehicles saved before this need the year, state and equipment added once. New database columns (migration `20261022120000_driver_vehicle_details.sql`) are applied to the current database. Proven on the live database (`live-e2e`). Equipment now decides which jobs a driver is offered and can accept (`da1111a`, server-enforced): towing needs a flatbed or wheel-lift tow truck, so light-duty service vehicles never see or take tows; a car the customer marked electric is towed by flatbeds only; every equipment type gets jump-starts, flat tires, lockouts, fuel, EV charging and oil changes. Accepting a job the equipment can't do is refused with the reason, shown in the driver app; the vehicle screen lists the jobs each equipment type is offered. Proven on the live database (light-duty refused a tow, wheel-lift refused an electric tow, flatbed sees both). Not yet: customers can't mark their car as electric in the app yet (the field exists but no screen sets it), so in practice the electric-car rule only applies to cars saved through the API; AWD/low cars aren't captured, so wheel-lifts are still offered them; no equipment option for a mobile EV charger or oil-change kit (every driver is offered those); admin panel doesn't show the vehicle yet; plate format is checked generally, not per state |
| D6 | Incident reporting + deactivation process | 🤝 | 🟡 incident reporting in the apps and the admin Reports inbox are done (B18, `5f2f559`): customers and drivers report problems (including safety concerns) about a job or in general, admins triage them (open → in review → resolved, internal notes, linked job and both parties). Drivers can already be suspended from the admin driver page (B4). Customers and drivers can block each other from a job (B12, `3eda4fa`), which keeps them apart in dispatch, and admins can read a reported job's chat. Still open: a written incident & deactivation policy (👤 — what gets a driver or customer suspended, how fast safety reports are looked at, appeals), a way to suspend a customer account, linking a suspension to the report that caused it, and alerting admins when a safety report arrives |

## E. Security & reliability
| # | Item | Owner | Status |
|---|---|---|---|
| E1 | Database least-privilege + attack test | 🛠 | ✅ |
| E2 | Private document storage, short-lived links | 🛠 | ✅ |
| E3 | Rate limiting, CAPTCHA on sign-up/reset, upload caps | 🛠 | ⬜ |
| E4 | One active request per customer / one job per driver; stale requests expire | 🛠 | ✅ `80f720a` — a customer can have only one open request: asking again is refused by the server, and the app takes them to the request they already have ("You already have a request in progress") instead of showing an error. A driver can hold only one unfinished job (refused at accept since `26ceb6e`). Both rules are also guaranteed by the database, so two requests (or two accepts) sent at the same instant can't both go through. A request no driver accepts within 15 minutes ends as "expired": it disappears from drivers' lists, a driver who tries to accept it is told it expired, and the customer sees "No drivers were available" with Request again (the waiting screen says when AID will stop looking). An accepted or on-the-way job whose driver sends no location or status update for 60 minutes is cancelled by the system; the customer is told the driver stopped responding (Request again), the driver is told why. Every automatic ending is in the job's audit trail. Checks run whenever either app loads or changes a job, plus every 60 seconds on the server. Settings: `REQUEST_EXPIRY_MINUTES` (1–240, default 15), `STALE_JOB_MINUTES` (15–1440, default 60), `EXPIRY_SWEEP_SECONDS` (default 60). New database status, column and indexes (migration `20261022200000_one_active_request_and_expiry.sql`) applied to the current database. Proven on the live database (`live-e2e`). Limits: no push alert when a request expires — the customer sees it when they open the app (B14); a driver who keeps AID closed for over an hour while heading to a job loses it, until background location (G2); jobs where the driver has arrived or started are never ended automatically (use Report an issue); the admin panel doesn't list expired or released jobs yet |
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
| F3 | Remove all fake data (fake providers, earnings, notifications) | 🛠 | ✅ `57b303e` (after `bd1c4d7` removed the fake SOS and the "Marcus Johnson" tracking screen). Removed: the mock data file (5 made-up providers with ratings and job counts, a "20% Off Your Next Service" promo notification that put a "1" on the Home bell, sample vehicles/addresses/bookings/messages); the on-phone "matching" that picked a random provider or invented "AID Pro #123" with a random 4.5–5.0 rating and ETA; the simulated chat (canned provider replies with a typing indicator), simulated driver movement on a map and "Mark Completed" button; seeded "recent searches"; the receipt's invented fee split (60% base / 35% distance / 5% surge); "Providers available nearby" on Home; the driver's hard-coded "$0.00" earnings and "0" completed, a rating that showed "0.0" for new drivers, a Notifications bell that did nothing and an always-"Good afternoon" greeting; and unused fake-data code (MapView with randomly placed driver pins, TrackingMap, HistoryModal). Now: the Updates tab shows "No active request" with no active job; while searching it shows the real request (service, price, address, Cancel through the server) and says the driver appears when one accepts; then the live tracking screen. Receipts show the server's price only ("Quoted total" until a final price exists) and the real driver's name. Driver Today shows jobs completed today counted from the driver's real job history (loading/error states), Earnings "Soon" with a note that payouts are coming, and a rating only once real ratings exist. Saved data from the old demo (chat threads, made-up providers) is wiped from phones on update. A test scans all app code so these markers can't return |
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
