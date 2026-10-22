# AID — competitive UI review (vs Uber, DoorDash, Lyft)

Date: 22 Oct 2026 · Branch `auth-foundation` · Reviewer: design pass G (after design passes A–F).

**How this was scored.** Each screen was compared with the equivalent pattern in Uber / Uber Driver,
DoorDash / Dasher and Lyft on eight points: hierarchy, density, typography, spacing rhythm, icon
consistency, motion / press states, empty / loading states and thumb reach. 1–10 per screen.
“Before” = the state after design passes A–F (`b105582`, screenshots `screenshots/design-*-after.png`).
“After” = this pass (`f06754f` … `675c5b0`, screenshots `design-g-*-after.png` in a browser at phone
width and `sim-*.png` from the real app in the iPhone 17 Pro simulator, iOS 26.5).
Anything below 8 was fixed in this pass; nothing is left below 8.

## Scorecard

| Screen | Before | After | What decided the score (gap → fix) |
|---|---|---|---|
| First launch / splash | 5 | 8 | Capacitor placeholder splash and app icon → AID mark on black splash; real app icon (iOS + Android) |
| Role select | 8 | 8 | Calm hero, two clear role buttons. Logo replaced by the new AID mark. (Uber uses a hero image here — optional later) |
| Sign in / sign up | 6 | 8 | Bar-chart logo, unclear “Customer” pill top-right, big empty middle → clean AID mark, no pill (driver app reads “AID Driver”), form placed with bounded spacing so the screen is balanced; keyboard-safe on short screens |
| Home | 8 | 9 | Tab said “Help” with a lifebuoy (clashed with Help & Support) → “Home” with a house icon; garage now loads at sign-in so Home shows your car (was “Add a vehicle” until Account was opened — found on the simulator); one icon weight |
| Request sheet | 8 | 8 | Already Uber-like (one sheet, price on the button, pinned CTA) |
| Location sheet | 7 | 8 | Leaflet's default blue pin and white zoom boxes looked off-brand → violet AID pin (44 px drag target, spoken name) and dark zoom buttons |
| Finding a driver | 8 | 8 | Map + sheet, honest “we'll stop looking at …” copy |
| Tracking | 8 | 8 | ETA headline, compact progress, plate badge, quiet safety rows — at Uber level |
| Chat | 8 | 8 | Full-screen chat on the shared dialog |
| Rating | 8 | 8 | One sheet, stars + tags + private note, Skip |
| Receipt | 8 | 8 | Big total, pinned Pay |
| Activity | 6 | 9 | Cancelled job showed “$79” like a charge → “No charge” in a muted colour (amount only if a payment really went through); two heavy boxed buttons per card → quiet “Receipt · Request again” text actions under a hairline; status inline after the date in colour (no chip row); subtle press-scale |
| Service details | 7 | 9 | Cancelled showed the price → “No charge”; same sheet otherwise |
| Account | 6 | 9 | Boxed header card → Uber-style big name with avatar on the right; separate trash column on the garage → one clean list, “Add vehicle” as the last row and Remove behind Edit / Done; footer verified clear of the tab bar when scrolled; scrolled content no longer slides under the clock (opaque status-bar strip, found on the simulator) |
| Help & Support | 8 | 8 | Help & Support now only under Account (no competing “Help” tab) |
| Safety | 8 | 8 | One sheet, 911 behind a confirm |
| Notification permission | 4 | 9 | The iPhone “Allow notifications?” prompt appeared right after sign-in (found on the simulator) → asked only after an in-app explainer at the useful moment: after a customer's first request (“Get alerts when your driver is on the way”) or a driver's first time online; “Not now” remembered |
| Driver Work | 7 | 8 | “Go offline” was a full-width box competing with incoming requests → quiet pill beside “You're online”; offline keeps one big violet “Go online” (Uber Driver pattern) |
| Driver request card | 8 | 8 | Price, distance, one violet Accept |
| Driver job screen | 8 | 8 | One dominant next step pinned in the thumb zone |
| Driver verification | 8 | 8 | Status card + one document list + pinned Submit |
| Driver vehicle form | 8 | 8 | Two-column fields, equipment choice list, pinned Save |
| Driver Settings | 7 | 8 | Boxed identity card → same big-name layout as customer Account |
| Admin queue | 8 | 8 | Dense, sticky filters, status pills; AID mark updated |
| Admin driver review | 8 | 8 | Documents beside facts, sticky decision panel |
| Admin reports | 8 | 8 | Safety rows flagged red |

**Average:** before 7.3 → after 8.2 (26 rows). Lowest before: notification prompt (4), splash (5),
sign-in / Activity / Account (6). Lowest after: 8.

## System-wide checks

- **One icon set, one stroke weight.** Every icon is lucide-react at stroke 2 (tab bar and Home tiles
  were 1.8 / 1.9 / 2.35). Only the check mark inside a selected choice is bolder. Guarded by
  `src/design.test.ts` (app + admin).
- **One brand mark.** “A with a location dot” glyph on the violet tile — app header, sign-in, password
  reset, role select, admin sidebar, iOS/Android app icon, splash, web favicon.
- **Motion.** Press-scale on buttons, tiles, icon buttons and whole Activity cards; sheet slide/fade;
  skeleton shimmer — all off with Reduce Motion.
- **Safe areas.** Checked on the iPhone 17 Pro simulator: status bar, Dynamic Island, home indicator and
  tab bar clearance on Home, Activity, Account (top and scrolled to the bottom), sheets.
- **Accessibility.** axe-core in a real browser: 0 serious/critical on the changed screens (Home,
  Activity, Account, service details, location, sign-in, driver sign-in, role select, driver Work,
  driver Settings, alerts explainer); 44 px targets (the garage “Edit” link was 41 px → fixed).

## Simulator evidence (real app, ad-hoc signed, iPhone 17 Pro, iOS 26.5)

`sim-01-launch-immediate`, `sim-02-launch-after-5s`, `sim-03-signin`, `sim-04-signin-filled`,
`sim-05-home`, `sim-06-activity`, `sim-07-detail-cancelled`, `sim-08-account`, `sim-09-account-bottom`,
`sim-10-garage-edit`, `sim-11-request-sheet`, `sim-12-location-sheet`, `sim-14-help`, and
`sim-13-BEFORE-FIX-notification-prompt-after-signin` (the problem this pass fixed).
Signed-in screens used a disposable test customer created through the auth admin API and deleted
afterwards (with its vehicle and one cancelled request).

## Not done here / recommendations

- **Sign in with Apple / Google** — recommended (Uber, Lyft and DoorDash all offer them). If Google (or
  any other social sign-in) is added, Apple requires Sign in with Apple too. Not built — see
  LAUNCH_CHECKLIST F8.
- **Session survives uninstall on iPhone.** The sign-in is kept in the Keychain, which iOS keeps when the
  app is deleted, so reinstalling opens straight into the old account. Common fix: on first launch after
  install, clear the stored session. Logged as LAUNCH_CHECKLIST E12.
- **Splash first frame.** iOS caches the launch screen; on the simulator the very first frame was plain
  dark before the app drew. Check on a real phone after a fresh install (G10).
- **Home avatar** shows the generic person icon until the profile name is loaded into Home's store after
  an app restart; Account shows initials. Minor.
- **Keyboard on sign-in** could not be shown on the simulator by automation (iOS only opens it on a real
  tap); the layout has bounded spacing and `max(16px)` inputs, checked at 375×667. Check on a real phone.
- **Role select** could use a hero illustration/photo (Uber/Lyft do); optional.
- **Android** icons/splash were generated from the same artwork but not run on an emulator here (G9).
  A monochrome (themed) Android icon is still to do.
- **iPhone Text Size** (F4) still doesn't reach the app — unchanged.
