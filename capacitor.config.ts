import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aid.roadside',
  appName: 'AID',
  webDir: 'dist',
  server: {
    // Allow loading from localhost during development
    androidScheme: 'https',
    iosScheme: 'capacitor'
  },
  ios: {
    // iOS-specific configuration
    contentInset: 'automatic',
    backgroundColor: '#0a0a0f',
    preferredContentMode: 'mobile',
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: false,
    // Web view configuration
    webContentsDebuggingEnabled: false // Set to true for development
  },
  plugins: {
    // Status bar configuration
    StatusBar: {
      style: 'dark',
      backgroundColor: '#0a0a0f'
    },
    // Keyboard configuration
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true
    },
    // Splash screen configuration
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0a0a0f',
      androidSplashResourceName: 'splash',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    }
  }
};

export default config;
