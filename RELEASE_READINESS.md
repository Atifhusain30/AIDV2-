# AID V2 Release Readiness

Verified on 2026-07-17 from branch `auth-foundation`.

## Current status

| Dimension | Status | Evidence |
| --- | --- | --- |
| Web/build health | Passing | `npm test` (19/19), `npm run lint`, `npm run build`, root/server `npm audit --audit-level=high` |
| Backend health | Passing locally | `node --test test/*.test.js` (21 passed, 1 live test skipped in normal suite); `/health` returned `status: ok` |
| Live product integration | Passing for exercised path | `LIVE_E2E=1 node --test test/live-e2e.test.js` completed customer → vehicle → booking → privacy-safe dispatch → driver acceptance/status → documents → cleanup against live Supabase |
| iOS packaging | Passing for simulator | Capacitor 8.4.2 packages aligned; sync, Xcode build, fresh uninstall/install/launch passed on iPhone 17 Pro simulator |
| iOS first launch | Passing after startup transition | Fresh app initially showed black during startup; after five seconds the role selector rendered correctly with safe areas and no blocking permission prompt |
| Android packaging | Not exercised this pass | Capacitor Doctor reports Android dependencies aligned, but Gradle/emulator build was not rerun |
| Payments | Blocked by configuration | Stripe code/tests are present, but client publishable key, server secret key, and webhook secret are not configured |
| Distribution | Blocked | Apple Developer signing/team and store metadata are not configured/verified |

## Verified commands

```bash
npm test
npm run lint
npm run build
npm audit --audit-level=high

cd server
node --test test/*.test.js
npm audit --audit-level=high
npm start
LIVE_E2E=1 node --test test/live-e2e.test.js

cd ..
npx cap doctor
npm run ios:sync
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Debug \
  -destination 'platform=iOS Simulator,id=B5B89B6F-9864-4042-BB91-03DF442C71C0' \
  -derivedDataPath ios/DerivedData CODE_SIGNING_ALLOWED=NO build
```

Fresh simulator artifact was uninstalled, reinstalled, launched, and inspected. `dist/index.html`, `ios/App/App/public/index.html`, and the built `App.app/public/index.html` had the same SHA-256 and asset names.

Screenshot evidence:

- `/Users/agentmac/Desktop/AID App Progress/AID-iOS-fresh-2026-07-17.png`
- `/Users/agentmac/Desktop/AID App Progress/AID-iOS-fresh-after-5s.png`

## Priority 0 — required before production use

1. Configure Stripe in test mode and exercise the real Payment Element/webhook lifecycle:
   - `VITE_STRIPE_PUBLISHABLE_KEY`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
2. Point distributable native builds at a deployed HTTPS API. The current local API URL is suitable only for host/simulator development.
3. Rotate Supabase server credentials if they may have appeared in prior local patch output, then re-run schema and live E2E verification.
4. Add rate limiting/abuse controls for authentication-adjacent and mutation endpoints before exposing the API publicly.

## Priority 1 — native and store compliance

1. Configure Apple Developer team, signing, bundle/version/build numbers, and archive validation.
2. Verify production icons, splash assets, privacy manifest/disclosures, permission copy, legal/support URLs, and account deletion flow.
3. Build and exercise Android independently with Gradle and an emulator/device; audit generated manifest permissions.
4. Improve the fresh-launch transition so users never see an unexplained black screen while the WebView initializes.
5. Verify notification delivery, deep links, password recovery, and native session restore on physical devices.

## Priority 2 — QA and delivery

1. Add end-to-end UI tests for customer location → service → vehicle → request → payment and driver onboarding → dispatch → completion.
2. Add Stripe webhook replay/idempotency and failed-payment regression tests.
3. Add CI for tests, type checking, production build, server tests, audits, and native compile smoke checks.
4. Run accessibility, short-height, keyboard, offline/error, and reduced-motion passes on real devices.
5. Stage internal testing, TestFlight/Play internal tracks, telemetry/crash reporting, then store submission.

## Xcode preview

Open `ios/App/App.xcodeproj`, select the `App` scheme and an installed simulator, then Run. For device/archive work, select the correct Apple team and use a Release archive; do not use `CODE_SIGNING_ALLOWED=NO` outside simulator compile verification.

## Android Studio preview

After `npm run android:sync`, open the `android/` directory in Android Studio, let Gradle sync, select an emulator/device, and Run. Also verify from the terminal with `cd android && ./gradlew assembleDebug` before treating Android packaging as healthy.
