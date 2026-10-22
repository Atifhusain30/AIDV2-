# AID — App Store “App Privacy” and Google Play “Data safety” answers

Paste-ready answers for the two store questionnaires. They match `ios/App/App/PrivacyInfo.xcprivacy`
(G3) and the permissions in `ios/App/App/Info.plist` (G2) and `android/app/src/main/AndroidManifest.xml`
(G5). If the app starts collecting something new (push tokens for B14, crash reporting, analytics,
background location), update all three files **and** this page before the next submission.

What AID collects today: name, email, phone, precise location (foreground only), vehicle details,
driver verification documents (photos/PDFs), in-app chat messages, ratings/reviews, support reports,
booking/payment records. Card details are entered in Stripe's payment form and processed by Stripe;
AID never stores card numbers. No advertising, no analytics SDKs, no tracking, no data sold.

Still needed from the owner before submitting: the public **Privacy Policy URL** (A-section / 5.2)
and, for Google Play, the **account-deletion web URL** (in-app deletion already exists, 5.14).

---

## Apple App Store Connect → App Privacy

**Do you or your third-party partners collect data from this app?** Yes.

For **every** data type below answer:
- **Used for:** App Functionality (only). *(Apple counts customer support as App Functionality.)*
- **Linked to the user's identity:** Yes.
- **Used for tracking:** No.

| App Store category → type | What it is in AID |
|---|---|
| Contact Info → **Name** | Account name shown to the other party of a job |
| Contact Info → **Email Address** | Sign-in, receipts, support replies |
| Contact Info → **Phone Number** | So customer and driver can reach each other during a job |
| Location → **Precise Location** | Customer pickup point; driver position while the app is open during an active job / when checking nearby requests |
| Identifiers → **User ID** | Account ID |
| Financial Info → **Payment Info** | Card entered in Stripe's form inside the app (processed by Stripe, not stored by AID) |
| Purchases → **Purchase History** | Bookings and what was paid |
| User Content → **Emails or Text Messages** | In-app chat between customer and driver |
| User Content → **Photos or Videos** | Driver verification document photos |
| User Content → **Customer Support** | “Report an issue” / support messages |
| User Content → **Other User Content** | Ratings and reviews |
| Other Data → **Other Data Types** | Vehicle details (make, model, plate), driver verification documents (PDF) |

Do **not** select: Health, Fitness, Sensitive Info, Contacts, Browsing/Search History, Coarse Location
(only precise is collected), Usage Data, Diagnostics, Device ID, Advertising Data, Audio.

**Tracking (App Tracking Transparency):** AID does not track — no ATT prompt needed.

**Export compliance** (asked on each upload): *Does your app use encryption?* → it uses only
standard HTTPS/TLS and Apple's built-in encryption, which is exempt. `ITSAppUsesNonExemptEncryption`
is already `false` in Info.plist, so App Store Connect won't ask per build.

---

## Google Play Console → Data safety

**Does your app collect or share any of the required user data types?** Yes.
**Is all of the user data collected by your app encrypted in transit?** Yes (HTTPS only; cleartext is off in release builds).
**Do you provide a way for users to request that their data is deleted?** Yes — in the app (Account → Delete account) and at *(account-deletion web URL — to add)*.

For every type below: **Collected:** Yes · **Shared:** No* · **Processed ephemerally:** No ·
**Required or optional:** as listed · **Purposes:** App functionality, Account management
(+ Fraud prevention, security, and compliance for driver documents).

\* Google counts transfers to service providers that process data on AID's behalf (Supabase hosting,
Stripe payments) as **not** sharing. Payment info is collected by Stripe — declare it as collected.

| Play category → type | Required? | Purposes |
|---|---|---|
| Personal info → **Name** | Required | App functionality, Account management |
| Personal info → **Email address** | Required | App functionality, Account management |
| Personal info → **Phone number** | Required | App functionality |
| Personal info → **Other info** (vehicle details) | Required for drivers | App functionality |
| Location → **Precise location** | Required for a request/job | App functionality |
| Financial info → **User payment info** | Required to pay | App functionality |
| Financial info → **Purchase history** | Required | App functionality |
| Messages → **Other in-app messages** (chat, support reports) | Optional | App functionality |
| Photos and videos → **Photos** (driver documents) | Required for drivers | App functionality, Fraud prevention/security/compliance |
| Files and docs → **Files and docs** (driver PDF documents) | Required for drivers | App functionality, Fraud prevention/security/compliance |
| App activity → **Other user-generated content** (ratings, reviews) | Optional | App functionality |
| App info and performance | **Not collected** (no crash reporting yet) | — |
| Device or other IDs | **Not collected** | — |

**Location permission declaration:** foreground only (ACCESS_FINE/COARSE_LOCATION). No background
location, so the Play “background location” declaration and video are **not** needed.

**Other Play permission declarations:** none required — no SMS/Call log, no all-files access, no
exact alarms (removed), no photo/video permissions (Android photo picker is used instead).
