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
    backgroundColor: '#0d0914',
    preferredContentMode: 'mobile',
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: false,
    // Web view configuration
    webContentsDebuggingEnabled: false // Set to true for development
  },
  plugins: {
    // Status bar configuration
    StatusBar: {
      // Light icons remain legible against the app's dark native chrome.
      style: 'light',
      backgroundColor: '#0d0914'
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
      backgroundColor: '#0d0914',
      androidSplashResourceName: 'splash',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    }
  }
};

export default config;
