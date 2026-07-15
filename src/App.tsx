/**
 * AID App - Main Application Component
 * Supports both Customer and Driver portals
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Briefcase, Clock3, LifeBuoy, MapPinned, ShieldCheck } from 'lucide-react'
import { useAppStore } from './store/useAppStore'
import { useAuthStore } from './store/useAuthStore'
import { useDriverStore } from './store/useDriverStore'
import { initNotifications, registerNotificationTapHandler } from './lib/notifications'
import { applyLeafletIconFix } from './lib/leafletFix'

// Customer Screens
import HomeScreen from './screens/HomeScreen'
import HistoryScreen from './screens/HistoryScreen'
import ChatScreen from './screens/ChatScreen'
import ProfileScreen from './screens/ProfileScreen'
import { CustomerLoginScreen } from './screens/customer'
import BottomNav from './components/ui/BottomNav'
import AidBrand from './components/brand/AidBrand'

// Driver Screens
import { 
  DriverLoginScreen, 
  DriverHomeScreen, 
  DriverOnboardingScreen,
  DriverJobScreen 
} from './screens/driver'

// Payment
import { PaymentCheckout } from './components/payment'

// App modes
type AppMode = 'select' | 'customer' | 'driver'
type DriverView = 'home' | 'onboarding' | 'job' | 'settings'

// Intro screen to select customer or driver
function AppModeSelector({
  onSelectCustomer,
  onSelectDriver,
}: {
  onSelectCustomer: () => void
  onSelectDriver: () => void
}) {
  return (
    <main className="mode-selector safe-top safe-bottom">
      <div className="mode-selector__map" aria-hidden="true">
        <span className="mode-selector__road mode-selector__road--a" />
        <span className="mode-selector__road mode-selector__road--b" />
        <span className="mode-selector__road mode-selector__road--c" />
        <div className="mode-selector__beacon"><span /></div>
      </div>

      <motion.section
        className="mode-selector__content"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
      >
        <AidBrand label="ROADSIDE, REIMAGINED" />

        <div className="mode-selector__hero">
          <p className="eyebrow">Assistance without the uncertainty</p>
          <h1>Help, right when it matters.</h1>
          <p>One trusted place to request help, follow every update, or earn by helping drivers get moving again.</p>
        </div>

        <div className="mode-selector__trust" aria-label="Service benefits">
          <span><Clock3 size={15} /> Clear arrival times</span>
          <span><ShieldCheck size={15} /> Verified providers</span>
          <span><MapPinned size={15} /> Live progress</span>
        </div>

        <div className="mode-selector__roles">
          <motion.button className="role-card role-card--customer" onClick={onSelectCustomer} whileTap={{ scale: 0.985 }}>
            <div className="role-card__icon"><LifeBuoy size={25} /></div>
            <div className="role-card__copy">
              <span>FOR CUSTOMERS</span>
              <strong>Get roadside help</strong>
              <p>Request service and follow your provider live.</p>
            </div>
            <div className="role-card__arrow"><ArrowRight size={20} /></div>
          </motion.button>

          <motion.button className="role-card role-card--driver" onClick={onSelectDriver} whileTap={{ scale: 0.985 }}>
            <div className="role-card__icon"><Briefcase size={25} /></div>
            <div className="role-card__copy">
              <span>FOR PROVIDERS</span>
              <strong>Drive with AID</strong>
              <p>Accept nearby work and manage every job.</p>
            </div>
            <div className="role-card__arrow"><ArrowRight size={20} /></div>
          </motion.button>
        </div>
      </motion.section>
    </main>
  )
}

// Import Modals
import { BookingDetailModal } from './components/modals'
import LocationConfirmModal from './components/modals/LocationConfirmModal'
import ReceiptModal from './components/modals/ReceiptModal'

// Customer App Component
function CustomerApp() {
  const { currentScreen } = useAppStore()
  const { logout } = useAuthStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const renderScreen = () => {
    switch (currentScreen) {
      case 'home':
        return <HomeScreen />
      case 'history':
        return <HistoryScreen />
      case 'chat':
        return <ChatScreen />
      case 'profile':
        return <ProfileScreen />
      default:
        return <HomeScreen />
    }
  }

  return (
    <div className="customer-shell min-h-screen flex justify-center">

      {/* Mobile App Container */}
      <div className="w-full max-w-[430px] relative min-h-screen">
        <AnimatePresence mode="wait">
          <motion.main
            key={currentScreen}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="relative z-10 pb-24 safe-top min-h-screen"
          >
            {renderScreen()}
          </motion.main>
        </AnimatePresence>

        <BottomNav />
      </div>

      {/* Global Modals */}
      <BookingDetailModal />
      <LocationConfirmModal />
      <ReceiptModal />
    </div>
  )
}

// Driver App Component
function DriverApp({ onLogout }: { onLogout: () => void }) {
  const [currentView, setCurrentView] = useState<DriverView>('home')
  const { user } = useAuthStore()
  const { activeBooking, fetchDocuments } = useDriverStore()

  // Fetch documents on mount
  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  // Check if needs onboarding
  const driver = user as any
  const needsOnboarding = driver && (!driver.documents?.length && driver.verificationStatus === 'pending')

  // Auto-show onboarding for new drivers
  useEffect(() => {
    if (needsOnboarding && currentView === 'home') {
      // Could auto-redirect to onboarding
    }
  }, [needsOnboarding, currentView])

  return (
    <AnimatePresence mode="wait">
      {currentView === 'home' && (
        <motion.div
          key="home"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <DriverHomeScreen
            onOpenOnboarding={() => setCurrentView('onboarding')}
            onOpenSettings={() => setCurrentView('settings')}
            onOpenActiveJob={() => setCurrentView('job')}
          />
        </motion.div>
      )}

      {currentView === 'onboarding' && (
        <motion.div
          key="onboarding"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <DriverOnboardingScreen
            onComplete={() => setCurrentView('home')}
            onSkip={() => setCurrentView('home')}
          />
        </motion.div>
      )}

      {currentView === 'job' && (
        <motion.div
          key="job"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <DriverJobScreen
            onBack={() => setCurrentView('home')}
            onOpenChat={() => {/* TODO: Implement driver chat */}}
          />
        </motion.div>
      )}

      {currentView === 'settings' && (
        <motion.div
          key="settings"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="driver-settings min-h-screen px-6 py-8 safe-top"
        >
          <button 
            onClick={() => setCurrentView('home')}
            className="text-gray-400 mb-6"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>
          
          <div className="space-y-4">
            <button
              onClick={() => setCurrentView('onboarding')}
              className="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-left"
            >
              <span className="text-white">Documents</span>
              <p className="text-gray-500 text-sm">Manage your verification documents</p>
            </button>
            
            <button
              onClick={onLogout}
              className="w-full p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400"
            >
              Log Out
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Main App Component
function App() {
  const [appMode, setAppMode] = useState<AppMode>('select')
  const { isAuthenticated, user, logout } = useAuthStore()

  // Initialize app features on startup
  useEffect(() => {
    // Fix Leaflet marker icons for bundler compatibility
    applyLeafletIconFix()
    
    // Register handler for notification taps. Permission is requested later,
    // after the user takes an action that benefits from booking updates.
    // Use getState() to avoid stale closure issues
    registerNotificationTapHandler((bookingId) => {
      console.log('[App] Notification tapped for booking:', bookingId)
      useAppStore.getState().openBookingDetailFromNotification(bookingId)
    })
  }, [])

  // Check for existing session
  useEffect(() => {
    if (isAuthenticated && user) {
      setAppMode(user.role === 'driver' ? 'driver' : 'customer')
      // Ask for native notification permission only after the user has signed in
      // or entered guest mode, when booking updates are relevant.
      void initNotifications()
    }
  }, [isAuthenticated, user])

  const handleLogout = () => {
    logout()
    setAppMode('select')
  }

  // Mode selection screen
  if (appMode === 'select') {
    return (
      <AppModeSelector
        onSelectCustomer={() => setAppMode('customer')}
        onSelectDriver={() => setAppMode('driver')}
      />
    )
  }

  // Customer flow
  if (appMode === 'customer') {
    if (!isAuthenticated) {
      return (
        <CustomerLoginScreen
          onLoginSuccess={() => {}}
          onSwitchToDriver={() => setAppMode('driver')}
        />
      )
    }
    return <CustomerApp />
  }

  // Driver flow
  if (appMode === 'driver') {
    if (!isAuthenticated) {
      return (
        <DriverLoginScreen
          onLoginSuccess={() => {}}
          onSwitchToCustomer={() => setAppMode('customer')}
        />
      )
    }
    return <DriverApp onLogout={handleLogout} />
  }

  return null
}export default App
