# AID Mobile Release Roadmap

Last verified: 2026-07-14

## Current verified state

- React/Vite production build passes.
- TypeScript check passes.
- First-run Vitest UI test passes.
- `npm audit` reports 0 known vulnerabilities in the root app; the server production audit also reports 0.
- Capacitor iOS and Android dependencies are aligned on 8.4.2.
- iOS and Android native projects are generated and synchronize successfully.
- iOS 26.5 Simulator runtime is installed on this Mac.
- The iOS app builds with Xcode, installs, and launches on an iPhone 17 Pro Simulator.
- A fresh install immediately shows the role selector without an unsolicited notification permission dialog.
- Android native compilation/emulator launch is not yet verified because this Mac currently has no Java runtime or Android SDK configured.

This is a working native preview, **not yet a production-ready store build**.

## Preview on this Mac with Xcode

From the repository root:

```bash
npm install
npm test
npm run ios:sync
npm run ios:open
```

In Xcode:

1. Select the **App** scheme.
2. Select an iPhone simulator, such as **iPhone 17 Pro**.
3. Press **Run** (`Command-R`).
4. For a physical iPhone or archive, open **App > Signing & Capabilities**, choose the correct Apple Developer team, and confirm the final bundle identifier. The current identifier is `com.aid.roadside`.
5. For App Store distribution, choose **Any iOS Device (arm64)** and use **Product > Archive**. Validate the archive before uploading it to App Store Connect.

The generated Xcode project is:

```text
ios/App/App.xcodeproj
```

After every web-code change, run `npm run ios:sync` before building in Xcode.

## Preview on Android

1. Install Android Studio, its Android SDK/platform tools, and the JDK version required by the generated Gradle project.
2. Start Android Studio once and finish its SDK setup.
3. From the repository root run:

```bash
npm install
npm run android:sync
npm run android:open
```

4. In Android Studio, wait for Gradle sync, create/start an emulator, select the `app` run configuration, and click **Run**.
5. Before Play Store release, configure the release keystore and create a signed Android App Bundle (`.aab`).

The Android application ID is currently `com.aid.roadside`, with version code `1` and version name `1.0`.

## Priority 0: production functionality blockers

### Backend and data

- Replace local/mock fallback behavior in `src/services/api.ts`. Production must use an explicit HTTPS `VITE_API_URL`; a missing production URL must fail configuration rather than silently behaving like a demo.
- Replace the in-memory booking/driver maps in `server/index.js` with a durable database and migrations. Current records disappear whenever the server restarts.
- Implement authenticated customer and driver endpoints. Enforce authorization server-side for every booking, profile, driver, chat, and payment operation.
- Add secure password handling or a managed authentication provider, refresh/session expiry, password reset, email/phone verification, abuse controls, and rate limiting.
- Deploy the API behind HTTPS, restrict CORS to approved origins, add structured logs, health monitoring, backups, and secret management.
- Validate all request bodies and never accept customer IDs, prices, driver assignment, or booking state transitions solely from the client.

### Roadside-assistance workflow

- Complete real customer request creation, dispatch/matching, driver acceptance, cancellation rules, ETA, arrival, service completion, receipts, and dispute/refund handling.
- Replace the current random/static provider matching, simulated coordinate movement, and timer-generated chat replies with server-owned dispatch, realtime driver location, and genuine customer/driver messaging.
- Replace local-only towing and EV-charging bookings and the detailing/window-tinting success simulations with persisted server operations.
- Make emergency actions real and platform-safe: the current SOS call/location-sharing behavior is simulated. Require an explicit confirmation before initiating emergency calls and verify location sharing end to end.
- Replace simulated status updates with server-owned state and realtime transport (WebSocket/SSE/push).
- Finish driver chat; `src/App.tsx` still contains an unimplemented driver-chat callback.
- Ensure guest mode has explicit limits and a safe way to recover/track a request.
- Add reliable offline, retry, timeout, duplicate-request, and interrupted-payment behavior.

### Payments

- Configure production Stripe keys and a deployed webhook endpoint.
- Replace `processDemoPayment` and the randomly successful demo flow with Stripe's supported payment-confirmation flow.
- Remove ordinary React inputs for raw card number, expiry, and CVC. Use Stripe Elements/Payment Element or a supported Stripe mobile SDK so card data never passes through application code.
- Implement Apple Pay with a real merchant identifier, entitlement, validation, and Stripe confirmation; the existing option is only a visual selector.
- Connect `PaymentCheckout` to the reachable booking workflow; it is currently imported but not rendered by the main app.
- Finish webhook persistence in `server/index.js`: successful and failed payment events currently only log TODOs and do not update durable booking/payment state.
- Calculate authoritative prices server-side; never trust client-submitted amounts.
- Add idempotency, receipts, refunds/cancellations, payment failure recovery, and reconciliation.
- Confirm the selected Stripe mobile flow complies with current Apple/Google policies for real-world services.

### Location, maps, and permissions

- Add the Android location permissions actually required by Capacitor Geolocation; the generated `AndroidManifest.xml` currently declares only internet access.
- Decide whether background location is truly necessary. Remove unused iOS "Always" wording/capabilities if it is not essential; otherwise implement the capability, user explanation, and policy-compliant background behavior.
- Test denied, restricted, approximate, disabled-services, and changed-permission states.
- Confirm the map tile/geocoding provider allows production mobile usage and add attribution, usage limits, and an API-key strategy if required.

### Notifications

- Request notification permission only after an in-app explanation and user action that creates a clear benefit (for example, after submitting a service request).
- Implement production remote push for booking updates. Local notifications alone cannot reliably deliver server-side dispatch/status changes.
- Configure APNs entitlement/certificates or keys, Firebase/Google services, device-token registration, token rotation, deep links, and notification preferences.

## Priority 1: store policy and product requirements

### Accounts, privacy, and legal

- If account creation is offered, provide in-app account deletion and server-side data deletion. Include retention exceptions and confirmation/re-authentication.
- Consolidate the conflicting authentication/profile models (`useAuthStore` and the mock auth state in `useAppStore`). A real signed-in customer must not see a second profile sign-in state, and sign-out must clear/revoke the actual session.
- Move sensitive tokens and identity data out of WebView `localStorage`; use secure native storage plus server-side expiry, refresh, revocation, and logout.
- Make the existing Privacy & Security and Help & Support menu items functional; they currently have no rendered destination.
- Publish working Privacy Policy, Terms, support, and contact URLs.
- Complete Apple App Privacy and Google Play Data Safety disclosures based on actual collection/sharing, including precise location, contact information, payment metadata, driver documents, diagnostics, and identifiers.
- Document retention, export/access, deletion, consent, and incident-response practices.
- Review whether driver identity/document handling requires additional compliance, encryption, or vendor agreements.

### Native metadata and configuration

- Confirm ownership and uniqueness of `com.aid.roadside` in both developer portals before release.
- Set signing teams, provisioning profiles, Android upload/release keys, version/build numbering, deployment targets, and release configuration.
- Create final app icon and launch/splash assets for every required iOS and Android size, including Android adaptive/monochrome icons.
- Add an iOS privacy manifest and verify required-reason API declarations from app code and SDKs.
- Remove permissions and usage descriptions not used by shipped features; add all genuinely required Android permissions.
- Decide iPhone/iPad support and orientation policy, then test every declared device/orientation. iPad currently declares portrait and landscape.
- Configure production universal/app links if booking or notification links should open the app.

### App review readiness

- Provide review credentials for customer and driver roles and a review script that demonstrates the full workflow.
- Ensure the reviewer can exercise location, dispatch, chat, and payment safely without requiring a real roadside event.
- Remove misleading static/demo data and disabled controls from release builds.
- Add a clear support and escalation path for active roadside requests.

## Priority 2: QA and release operations

- Expand automated coverage beyond the single first-run test: auth, role switching, request creation, validation, location denial, dispatch transitions, chat, payments, notifications, cancellation, account deletion, and persistence.
- Add server unit/integration tests and contract tests between the app and API.
- Test at minimum on a current and older supported iPhone, a small and large Android phone, slow networks, offline mode, accessibility text sizes, VoiceOver/TalkBack, reduced motion, dark mode, and keyboard-open layouts.
- Replace uncontrolled direct client traffic to public Nominatim/OpenStreetMap services with a production-approved geocoding/tile strategy that satisfies attribution, identification, caching, rate-limit, and usage-policy requirements.
- Add crash reporting and privacy-aware analytics only after disclosures/consent are finalized.
- Create staging and production environments with separate secrets, API URLs, Stripe modes, push credentials, databases, and release channels.
- Add CI gates for tests, TypeScript, production build, dependency audit, iOS build, Android build, and artifact signing.
- Run TestFlight and Play closed testing before public submission.

## Submission sequence

1. Finish the Priority 0 backend and end-to-end workflow blockers.
2. Complete legal/privacy/account-deletion requirements.
3. Finalize native permissions, assets, identifiers, signing, and store metadata.
4. Run the full device/accessibility/payment/location QA matrix.
5. Ship staging builds to TestFlight and Play closed testing.
6. Resolve tester findings and create release candidates.
7. Archive/upload in Xcode and upload the signed Android App Bundle.
8. Complete App Store Connect and Play Console forms, screenshots, review notes, and phased rollout settings.
