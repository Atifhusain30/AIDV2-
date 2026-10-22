# AID - Roadside Assistance App

[![CI](https://github.com/Atifhusain30/AIDV2-/actions/workflows/ci.yml/badge.svg?branch=auth-foundation)](https://github.com/Atifhusain30/AIDV2-/actions/workflows/ci.yml)

A modern mobile application for on-demand roadside assistance services, built with React, TypeScript, and Capacitor for iOS deployment.

## Overview

AID connects customers who need roadside assistance with service providers (drivers) in real-time. The app supports both **Customer** and **Driver** portals with full authentication, payment processing, live location tracking, and service management.

## Features

### Customer Features
- 🚗 **Service Request** - Request various roadside services (towing, battery jump, flat tire, lockout, etc.)
- 📍 **Live Location** - Real-time GPS tracking for accurate pickup
- 💳 **Payments** - Secure payment processing via Stripe
- 🗺️ **Map Integration** - View service provider location and ETA
- 💬 **In-App Chat** - Communicate with your service provider
- 📜 **Service History** - Track past and ongoing service requests

### Driver Features
- 🔐 **Driver Portal** - Separate login and dashboard for drivers
- 📄 **Document Upload** - Upload driver's license and ID for verification
- 📡 **Go Online/Offline** - Control availability for receiving requests
- 🔔 **Incoming Requests** - Receive and accept service requests
- 📍 **Live Tracking** - Share location with customers
- 📊 **Job Management** - Update job status through completion

### Services Available
- Oil Change
- Battery Jump Start
- Flat Tire Repair/Change
- Vehicle Lockout
- Towing
- EV Charging
- Fuel Delivery
- Car Detailing
- Window Tinting

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **State Management**: Zustand
- **Mobile**: Capacitor (iOS)
- **Payments**: Stripe
- **Location**: @capacitor/geolocation
- **File Upload**: @capawesome/capacitor-file-picker

## Project Structure

```
aid-app/
├── src/
│   ├── App.tsx                 # Main app with customer/driver routing
│   ├── main.tsx                # Entry point
│   ├── screens/
│   │   ├── HomeScreen.tsx      # Customer home
│   │   ├── HistoryScreen.tsx   # Service history
│   │   ├── ChatScreen.tsx      # Provider chat
│   │   ├── ProfileScreen.tsx   # User profile
│   │   ├── customer/           # Customer-specific screens
│   │   └── driver/             # Driver portal screens
│   ├── components/
│   │   ├── modals/             # Service request modals
│   │   ├── payment/            # Payment components
│   │   ├── maps/               # Map components
│   │   └── ui/                 # Shared UI components
│   ├── services/
│   │   ├── location.ts         # Geolocation service
│   │   ├── payment.ts          # Stripe integration
│   │   ├── documents.ts        # Document upload
│   │   └── api.ts              # Backend API calls
│   ├── store/
│   │   ├── useAppStore.ts      # Main app state
│   │   ├── useAuthStore.ts     # Authentication state
│   │   └── useDriverStore.ts   # Driver-specific state
│   └── types/                  # TypeScript definitions
├── server/                     # Backend API server
├── ios/                        # iOS native project
└── dist/                       # Build output
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Xcode 15+ (for iOS development)
- CocoaPods (for iOS dependencies)

### Installation

```bash
# Clone and navigate to project
cd aid-app

# Install dependencies
npm install

# Create environment file (frontend)
cp .env.example .env
# Add your API keys to .env

# Build the web app
npm run build

# Sync with iOS
npx cap sync ios
```

### Running the App

```bash
# Development server (web)
npm run dev

# Build for production
npm run build

# iOS development
npm run ios:sync    # Build + sync
npm run ios:open    # Open Xcode
npm run ios:run     # Build + run on simulator
```

## Payments Setup (Stripe)

### 1. Get Stripe API Keys

1. Create account at [Stripe Dashboard](https://dashboard.stripe.com)
2. Get your keys from **Developers > API Keys**
3. For testing, use the test mode keys (starting with `pk_test_` and `sk_test_`)

### 2. Save the keys with the setup script (recommended)

Run this in your own Terminal (the keys are hidden while you paste them and are never printed):

```bash
bash "/Users/agentmac/Desktop/aid app store/AIDV2-/scripts/set-stripe-keys.sh"
```

It asks for the secret key (`sk_test_…`), the publishable key (`pk_test_…`) and, optionally, the webhook
signing secret (`whsec_…`; press Return to skip). It checks the prefixes and that both keys are the same mode
(asks you to type `LIVE` before saving live keys), writes `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` and
`STRIPE_WEBHOOK_SECRET` into `server/.env` and `VITE_STRIPE_PUBLISHABLE_KEY` into `.env.local` (every other
line is kept; both files are owner-only and ignored by Git), then asks Stripe whether the key works and prints
only `Stripe key OK (test mode)` or the error type. Afterwards restart the API and rebuild the app.

### 2b. Or configure the variables by hand

**Frontend** (`.env.local`):
```bash
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
VITE_API_URL=http://localhost:3001/api
```

**Backend** (`server/.env`):
```bash
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

### 3. Run the Backend Server

```bash
cd server
npm install
npm start
```

### 4. Test Payments

Use Stripe's test card numbers:
- **Success**: 4242 4242 4242 4242
- **Decline**: 4000 0000 0000 0002
- Any future expiry date and any 3-digit CVC

## Live Location Setup

### iOS Permissions

The following permissions are already configured in `ios/App/App/Info.plist`:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>AID needs your location to find nearby roadside assistance providers.</string>

<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>AID needs your location to track service progress in the background.</string>
```

### Using Location in Code

```typescript
import { locationService } from './services/location'

// Request permission
await locationService.requestPermission()

// Get current location
const location = await locationService.getCurrentLocation()

// Watch location updates
const watchId = await locationService.watchLocation((loc) => {
  console.log('New location:', loc)
})

// Stop watching
await locationService.stopWatch(watchId)
```

## Maps Setup

### Option 1: Google Maps (Recommended for Production)

1. Get API key from [Google Cloud Console](https://console.cloud.google.com/google/maps-apis)
2. Enable "Maps JavaScript API" and "Maps Static API"
3. Add to environment:

```bash
VITE_GOOGLE_MAPS_API_KEY=your_api_key_here
```

### Option 2: Map Visualization Mode (Development)

Without an API key, the app shows a stylized map visualization with coordinate display. This is suitable for development and demo purposes.

## iOS Build & Deployment

### Development Build

```bash
# 1. Install dependencies
npm install

# 2. Build web app
npm run build

# 3. Sync with iOS
npx cap sync ios

# 4. Open in Xcode
npx cap open ios

# 5. Select simulator or device, then Run (⌘R)
```

### Production Build

1. Open `ios/App/App.xcodeproj` in Xcode
2. Select **Product > Archive**
3. In Organizer, click **Distribute App**
4. Follow App Store Connect submission flow

### Signing & Certificates

1. Create App ID at [Apple Developer Portal](https://developer.apple.com)
2. Create provisioning profiles for Development and Distribution
3. In Xcode: **Signing & Capabilities** > Select your team

## Common Issues & Fixes

### "Module not found" errors

```bash
rm -rf node_modules package-lock.json
npm install
```

### iOS build fails

```bash
cd ios/App
rm -rf Pods Podfile.lock
pod install --repo-update
```

### Capacitor sync issues

```bash
npx cap sync ios --inline
```

### Location not working on iOS Simulator

The iOS Simulator requires manual location setting:
1. In Simulator: **Features > Location > Custom Location**
2. Or use **Features > Location > City Run** for simulated movement

### Payment intent errors

1. Verify backend is running (`npm start` in `/server`)
2. Check Stripe keys are correct in environment
3. Ensure amount is in cents (e.g., $45.00 = 4500)

## Customer Flow

1. **Select Service** - Choose from available services
2. **Confirm Location** - GPS detects current position
3. **Enter Details** - Vehicle info, problem description
4. **Payment** - Enter payment method
5. **Confirm Request** - Submit service request
6. **Track Driver** - See driver location and ETA
7. **Service Complete** - Rate and review

## Driver Flow

1. **Login/Register** - Create driver account
2. **Document Upload** - Submit DL and ID for verification
3. **Go Online** - Start receiving requests
4. **Accept Request** - View details and accept jobs
5. **Navigate to Customer** - Use maps for directions
6. **Update Status** - Mark arrived, in progress, completed
7. **Earn Money** - Payments processed automatically

## Environment Variables

### Frontend (.env)
| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe public key | Yes |
| `VITE_API_URL` | Backend API URL | Yes |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps API key | No |

### Backend (server/.env)
| Variable | Description | Required |
|----------|-------------|----------|
| `STRIPE_SECRET_KEY` | Stripe secret key | Yes |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | For webhooks |
| `PORT` | Server port | No (default: 3001) |
| `CORS_ORIGIN` | Allowed CORS origin | No |

## Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run lint         # Type check with TypeScript
npm run preview      # Preview production build
npm run ios:sync     # Build + sync iOS
npm run ios:open     # Open Xcode
npm run ios:run      # Build + run on iOS
```

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

This project is proprietary. All rights reserved.

## Support

For issues or questions, please open a GitHub issue or contact the development team.
