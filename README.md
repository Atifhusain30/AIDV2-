# AID - Roadside Assistance App

A modern roadside assistance application built with React, TypeScript, and Framer Motion.

## Features

- 🚗 Emergency roadside services (battery jump, flat tire, lockout, etc.)
- 🚚 Towing service with location tracking
- ⚡ EV charging assistance
- ✨ Car detailing booking
- 🪟 Window tinting services
- 🆘 Emergency SOS with one-tap options
- 📍 Location-based services
- 📜 Service history tracking

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **Framer Motion** - Animations
- **Zustand** - State management
- **React Router** - Navigation
- **Lucide React** - Icons

## Getting Started

```bash
# Install dependencies
npm install --legacy-peer-deps

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
src/
├── components/
│   ├── modals/          # Service modals
│   └── ui/              # Reusable UI components
├── screens/             # Main screens
├── store/               # Zustand store
├── types/               # TypeScript types
├── utils/               # Utility functions
└── data/                # Mock data
```

## iOS Compatibility

This app includes iOS-specific optimizations:
- Safe area handling for notched devices
- Touch scroll optimization
- Input zoom prevention
- Hardware-accelerated animations

## Deployment

This app is configured for Netlify deployment. Simply connect your GitHub repository to Netlify and it will auto-deploy.

### Manual Deployment

1. Build the project: `npm run build`
2. Deploy the `dist` folder to any static hosting

### Netlify Setup

1. Connect your GitHub repository to Netlify
2. Build settings are auto-detected from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`

## Environment Variables

No environment variables are required for the basic app. For production features, you may add:

```env
VITE_API_URL=your-api-url
VITE_GOOGLE_MAPS_KEY=your-maps-key
```

## License

MIT


