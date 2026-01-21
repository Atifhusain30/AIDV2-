# AID - iOS Deployment Guide

## Overview

This document provides complete instructions for deploying the AID Roadside Assistance app to iOS via the App Store.

## Prerequisites

### Development Environment
- **macOS** (required for iOS builds)
- **Xcode 15.0+** (download from Mac App Store)
- **Node.js 18+** (use nvm for version management)
- **CocoaPods** (install via `sudo gem install cocoapods`)
- **Apple Developer Account** ($99/year for App Store distribution)

### Required Accounts & Certificates
1. Apple Developer Program membership
2. iOS Distribution Certificate
3. App Store Provisioning Profile
4. App Store Connect app record

---

## Quick Start

```bash
# Install dependencies
npm install

# Build web assets
npm run build

# Sync to iOS project
npm run ios:sync

# Open in Xcode (macOS only)
npm run ios:open
```

---

## Project Structure

```
aid-app/
├── ios/                          # Native iOS project (Capacitor-generated)
│   └── App/
│       ├── App/
│       │   ├── AppDelegate.swift
│       │   ├── Info.plist        # iOS configuration
│       │   ├── Assets.xcassets/  # App icons & launch images
│       │   └── public/           # Web assets (copied from dist/)
│       └── App.xcodeproj/        # Xcode project file
├── src/                          # React web app source
├── dist/                         # Build output (web assets)
├── capacitor.config.ts           # Capacitor configuration
└── package.json
```

---

## Build Process

### Step 1: Build Web Assets
```bash
npm run build
```
This compiles TypeScript and creates optimized production build in `dist/`.

### Step 2: Sync to iOS
```bash
npx cap sync ios
```
This copies web assets to iOS project and updates native plugins.

### Step 3: Open Xcode
```bash
npx cap open ios
```
This opens the iOS project in Xcode.

### Step 4: Configure Signing

In Xcode:
1. Select the **App** target
2. Go to **Signing & Capabilities**
3. Select your Team
4. Choose or create a provisioning profile
5. Ensure "Automatically manage signing" is checked (for development)

### Step 5: Build & Run

- **Simulator**: Select a simulator from the device dropdown, press ⌘+R
- **Physical Device**: Connect device, select it, press ⌘+R (requires signing)

### Step 6: Archive for App Store

1. Select **Product → Archive**
2. In Organizer, select the archive
3. Click **Distribute App**
4. Choose **App Store Connect**
5. Follow the upload wizard

---

## Configuration Details

### Bundle ID
`com.aid.roadside`

### Version Numbers
- **Marketing Version**: 1.0.0 (shown to users)
- **Build Number**: 1 (increment for each build)

### Supported Devices
- iPhone (iOS 14.0+)
- iPad (iOS 14.0+)

### Orientations
- iPhone: Portrait only
- iPad: All orientations

---

## Privacy & Permissions

The app requests the following permissions (declared in Info.plist):

| Permission | Key | Description |
|------------|-----|-------------|
| Location (When In Use) | NSLocationWhenInUseUsageDescription | Find nearby service providers |
| Location (Always) | NSLocationAlwaysAndWhenInUseUsageDescription | Track service progress in background |

### URL Schemes Allowed
- `tel:` - Phone calls
- `mailto:` - Email
- `maps:` - Apple Maps

---

## App Store Submission Checklist

### Before Submission
- [ ] App icons at all required sizes (see Assets.xcassets)
- [ ] Launch screen configured
- [ ] Privacy policy URL ready
- [ ] Support URL ready
- [ ] App description written
- [ ] Keywords selected
- [ ] Screenshots for all device sizes
- [ ] App preview video (optional)

### App Store Connect Setup
- [ ] Create App Store Connect record
- [ ] Set pricing (Free or paid)
- [ ] Configure age rating
- [ ] Set content rights declarations
- [ ] Configure App Privacy questionnaire

### Technical Requirements
- [ ] No crashes on launch
- [ ] All buttons/links functional
- [ ] Network requests use HTTPS
- [ ] No placeholder content
- [ ] No debug code/logging in release

---

## Troubleshooting

### Build Fails: "No signing certificate"
1. Open Keychain Access
2. Check for expired certificates
3. Re-download from Apple Developer portal

### Build Fails: "Provisioning profile doesn't include..."
1. Add device UDID to Apple Developer portal
2. Regenerate provisioning profile
3. Download and double-click to install

### App Crashes on Launch
1. Check Xcode console for error messages
2. Verify all plugins are properly linked
3. Run `npx cap sync ios` to refresh

### White Screen on Launch
1. Verify `dist/` contains built assets
2. Check `capacitor.config.ts` webDir setting
3. Run full build: `npm run build && npx cap sync ios`

---

## CI/CD Integration

For automated builds, use:

```yaml
# GitHub Actions example
- name: Build iOS
  run: |
    npm ci
    npm run build
    npx cap sync ios
    cd ios/App
    xcodebuild -scheme App -sdk iphoneos -configuration Release archive
```

---

## Support

For issues specific to:
- **Capacitor**: https://capacitorjs.com/docs
- **iOS Development**: https://developer.apple.com/documentation
- **App Store Review**: https://developer.apple.com/app-store/review/guidelines

