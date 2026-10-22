import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard, KeyboardStyle } from '@capacitor/keyboard';
import { SplashScreen } from '@capacitor/splash-screen';

/**
 * Initialize Capacitor plugins for native iOS experience
 */
export async function initializeCapacitor(): Promise<void> {
  // Only run on native platforms
  if (!Capacitor.isNativePlatform()) {
    console.log('Running in web browser - skipping native initialization');
    return;
  }

  console.log('Initializing Capacitor for native platform:', Capacitor.getPlatform());

  try {
    // Configure Status Bar for dark theme
    if (Capacitor.isPluginAvailable('StatusBar')) {
      await StatusBar.setStyle({ style: Style.Dark });
      // iOS doesn't support background color via plugin, handled via Info.plist
    }

    // Configure Keyboard for dark theme
    if (Capacitor.isPluginAvailable('Keyboard')) {
      await Keyboard.setStyle({ style: KeyboardStyle.Dark });
    }

    // Hide splash screen after app loads
    if (Capacitor.isPluginAvailable('SplashScreen')) {
      await SplashScreen.hide();
    }

    console.log('Capacitor initialization complete');
  } catch (error) {
    console.error('Error initializing Capacitor:', error);
  }
}
