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
import { useJobLocationSharing } from './lib/useJobLocationSharing'
import { useDriverJobSync } from './lib/useDriverJobSync'
import { useActiveBookingSync } from './lib/useActiveBookingSync'
import { useRealtimeConnection } from './lib/useRealtimeConnection'
import EndedBookingNotice from './components/tracking/EndedBookingNotice'
import { initNotifications, registerNotificationTapHandler } from './lib/notifications'
import { applyLeafletIconFix } from './lib/leafletFix'
import { apiService } from './services/api'
import { settleStaleActiveBooking } from './services/bookingService'
import { driverVehicleSummary } from './lib/driverVehicle'
import type { Booking, Driver } from './types'
import { App as CapacitorApp } from '@capacitor/app'
import { supabase } from './auth/supabase'
import { installSessionWatch, signOut } from './auth/signOut'
import { completeRecoveryFromUrl } from './auth/recovery'
import PasswordRecoveryScreen from './components/auth/PasswordRecoveryScreen'
import { SafetyMenuItem } from './components/safety/Safety'
import RatingSheet from './components/rating/RatingSheet'
import PendingRatingReminder from './components/rating/PendingRatingReminder'
import { markRatingSkipped, type PendingRating } from './lib/ratings'

// Customer Screens
import HomeScreen from './screens/HomeScreen'
import HistoryScreen from './screens/HistoryScreen'
import UpdatesScreen from './screens/UpdatesScreen'
import ProfileScreen from './screens/ProfileScreen'
import HelpSupportScreen from './screens/HelpSupportScreen'
import { CustomerLoginScreen } from './screens/customer'
import BottomNav from './components/ui/BottomNav'
import OfflineBanner from './components/ui/OfflineBanner'
import AidBrand from './components/brand/AidBrand'

// Driver Screens
import { 
  DriverLoginScreen, 
  DriverHomeScreen, 
  DriverOnboardingScreen,
  DriverJobScreen,
  DriverVehicleScreen,
} from './screens/driver'

// App modes
type AppMode = 'select' | 'customer' | 'driver'
type DriverView = 'home' | 'onboarding' | 'job' | 'settings' | 'vehicle' | 'help'

const CUSTOMER_TITLES: Record<string, string> = { home: 'Home', history: 'Activity', chat: 'Updates', profile: 'Account' }
const DRIVER_TITLES: Record<DriverView, string> = {
  home: 'Driver home', onboarding: 'Verification', job: 'Active job', settings: 'Settings', vehicle: 'Vehicle & equipment', help: 'Help & Support',
}

/** Sets document.title as "<screen> · AID" while the screen is shown. */
function useDocumentTitle(title: string | null) {
  useEffect(() => { if (title) document.title = `${title} · AID` }, [title])
}

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

        <div className="mode-selector__trust" role="group" aria-label="Service benefits">
          <span><Clock3 size={15} aria-hidden="true" /> Clear arrival times</span>
          <span><ShieldCheck size={15} aria-hidden="true" /> Verified providers</span>
          <span><MapPinned size={15} aria-hidden="true" /> Live progress</span>
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
  // Keep the active request (status, driver, live location, ETA) current on every customer screen.
  useActiveBookingSync()
  // B11: live updates while the customer has an active request (polling covers the rest).
  const hasLiveRequest = useAppStore((state) => Boolean(state.activeBooking?.id))
  const signedIn = useAuthStore((state) => Boolean(state.token))
  useRealtimeConnection(signedIn && hasLiveRequest)
  const { user } = useAuthStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // F4: each screen has its own page title (read by screen readers on web / the admin site).
  useDocumentTitle(CUSTOMER_TITLES[currentScreen] ?? 'Home')

  const renderScreen = () => {
    switch (currentScreen) {
      case 'home':
        return <HomeScreen />
      case 'history':
        return <HistoryScreen />
      case 'chat':
        return <UpdatesScreen />
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
        {/* F5: no connection / server unreachable, on every screen. */}
        <OfflineBanner />
        <AnimatePresence mode="wait">
          <motion.main
            key={currentScreen}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="customer-main relative z-10 safe-top min-h-screen"
          >
            {renderScreen()}
          </motion.main>
        </AnimatePresence>

        <BottomNav />
        <EndedBookingNotice />
      </div>

      {/* Global Modals */}
      <BookingDetailModal />
      <LocationConfirmModal />
      <ReceiptModal />
      {/* B15: one reminder on open for a job still waiting for a rating (not the one whose receipt is open). */}
      <PendingRatingReminder userId={user?.id} busyBookingId={() => useAppStore.getState().receiptBookingId} />
    </div>
  )
}

// Driver App Component
function DriverApp({ onLogout }: { onLogout: () => void }) {
  const [currentView, setCurrentView] = useState<DriverView>('home')
  // The vehicle screen returns to wherever it was opened from (home, onboarding or settings).
  const [vehicleReturn, setVehicleReturn] = useState<DriverView>('home')
  const openVehicle = (from: DriverView) => { setVehicleReturn(from); setCurrentView('vehicle') }
  useDocumentTitle(DRIVER_TITLES[currentView])
  // Share GPS with the customer on every driver screen while a job is active.
  useJobLocationSharing()
  // Notice a customer cancellation (or any server-side change) to the active job.
  useDriverJobSync()
  // B11: live updates while the driver is online (new nearby requests) or on a job.
  const driverLive = useDriverStore((state) => state.isOnline || Boolean(state.activeBooking?.id))
  useRealtimeConnection(driverLive)
  const { user } = useAuthStore()
  const { activeBooking, fetchDocuments } = useDriverStore()
  // B15: right after completing a job, the driver rates the customer (skippable; one reminder on next open).
  const [rateCustomer, setRateCustomer] = useState<PendingRating | null>(null)
  const askToRate = async (job: Booking) => {
    const result = await apiService.listPendingRatings()
    const pending = result.success ? result.data?.find((item) => item.bookingId === job.id) : undefined
    if (pending) setRateCustomer(pending)
  }

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
    <>
    <OfflineBanner />
    <AnimatePresence mode="wait">
      {currentView === 'home' && (
        <motion.main
          key="home"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <DriverHomeScreen
            onOpenOnboarding={() => setCurrentView('onboarding')}
            onOpenVehicle={() => openVehicle('home')}
            onOpenSettings={() => setCurrentView('settings')}
            onOpenActiveJob={() => setCurrentView('job')}
          />
        </motion.main>
      )}

      {currentView === 'onboarding' && (
        <motion.main
          key="onboarding"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <DriverOnboardingScreen
            onComplete={() => setCurrentView('home')}
            onSkip={() => setCurrentView('home')}
            onOpenVehicle={() => openVehicle('onboarding')}
          />
        </motion.main>
      )}

      {currentView === 'vehicle' && (
        <motion.main
          key="vehicle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <DriverVehicleScreen
            backLabel={vehicleReturn === 'onboarding' ? 'Back to verification' : vehicleReturn === 'settings' ? 'Back to settings' : 'Back to work'}
            onBack={() => setCurrentView(vehicleReturn)}
            onSaved={() => setCurrentView(vehicleReturn)}
          />
        </motion.main>
      )}

      {currentView === 'job' && (
        <motion.main
          key="job"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <DriverJobScreen
            onBack={() => setCurrentView('home')}
            onCompleted={(job) => void askToRate(job)}
          />
        </motion.main>
      )}

      {currentView === 'help' && (
        <motion.main key="help" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="driver-help">
          <HelpSupportScreen audience="driver" onBack={() => setCurrentView('settings')} />
        </motion.main>
      )}

      {currentView === 'settings' && (
        <motion.main
          key="settings"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="driver-settings min-h-screen px-6 py-8 safe-top"
        >
          <button
            type="button"
            onClick={() => setCurrentView('home')}
            className="text-gray-400 mb-4 -ml-2 min-h-[44px] px-2"
          >
            <span aria-hidden="true">← </span>Back
          </button>
          <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>
          
          <div className="space-y-4">
            <button
              onClick={() => setCurrentView('onboarding')}
              className="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-left"
            >
              <span className="text-white">Documents</span>
              <p className="text-gray-400 text-sm">Manage your verification documents</p>
            </button>

            <button
              onClick={() => openVehicle('settings')}
              className="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-left"
            >
              <span className="text-white">Vehicle & equipment</span>
              <p className="text-gray-400 text-sm">{driverVehicleSummary((user as Driver | null)?.vehicle) || 'Add the vehicle customers will look for'}</p>
            </button>
            
            <button
              onClick={() => setCurrentView('help')}
              className="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-left"
            >
              <span className="text-white">Help &amp; Support</span>
              <p className="text-gray-400 text-sm">Report a problem, your reports, common questions</p>
            </button>

            <div className="account-menu">
              <SafetyMenuItem audience="driver" />
            </div>

            <button
              onClick={onLogout}
              className="w-full p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400"
            >
              Log Out
            </button>
          </div>
        </motion.main>
      )}
    </AnimatePresence>
    {/* Mounted once per app open so the reminder runs once (never re-triggered by the sheet below). */}
    <PendingRatingReminder userId={user?.id} />
    {rateCustomer && (
      <RatingSheet
        pending={rateCustomer}
        context="after_job"
        onRated={() => setRateCustomer(null)}
        onSkip={() => { if (user) markRatingSkipped(user.id, rateCustomer.bookingId); setRateCustomer(null) }}
      />
    )}
    </>
  )
}

// Main App Component
function App() {
  const [appMode, setAppMode] = useState<AppMode>('select')
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)
  const { isAuthenticated, user, token, restoreSession } = useAuthStore()

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
    void restoreSession()
  }, [restoreSession])

  useEffect(() => {
    const handleUrl = async (url: string) => {
      try {
        if (await completeRecoveryFromUrl(supabase.auth, url)) {
          setRecoveryError(null)
          setIsRecoveringPassword(true)
        }
      } catch (error) {
        setRecoveryError(error instanceof Error ? error.message : 'Password recovery link is invalid or expired.')
        setIsRecoveringPassword(false)
      }
    }
    let cancelled = false
    let listener: { remove: () => Promise<void> } | undefined
    void CapacitorApp.addListener('appUrlOpen', ({ url }) => void handleUrl(url))
      .then((registered) => {
        if (cancelled) {
          void registered.remove()
          return
        }
        listener = registered
      })
      .catch(() => setRecoveryError('Unable to initialize password recovery links.'))
    void CapacitorApp.getLaunchUrl()
      .then((launch) => { if (launch?.url) void handleUrl(launch.url) })
      .catch(() => setRecoveryError('Unable to read the password recovery link.'))
    return () => {
      cancelled = true
      void listener?.remove()
    }
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

  // E6: sign out here when the session ends elsewhere (refresh failed, revoked) or another account appears.
  useEffect(() => installSessionWatch(), [])

  // Load marketplace state for the signed-in person. Their profile and role were confirmed by the
  // server (GET /api/me) at sign-in / app start — never taken from anything saved on the phone (E6).
  const userRole = user?.role
  useEffect(() => {
    if (!token || !user) return
    let cancelled = false

    void (async () => {
      if (user.role === 'driver') {
        useDriverStore.setState({ isOnline: Boolean((user as Driver).isOnline) })
        await useDriverStore.getState().fetchActiveBooking(user.id)
        return
      }

      const [history, active] = await Promise.all([apiService.listBookings(), apiService.getActiveBooking()])
      if (cancelled) return
      const store = useAppStore.getState()
      const previous = store.activeBooking
      if (history.success && history.data) {
        store.clearBookings()
        history.data.slice().reverse().forEach((booking) => store.addToBookingHistory(booking))
      }
      // If the request this device was following ended while the app was closed (e.g. it expired
      // with no driver), say so rather than silently dropping it.
      if (active.success) await settleStaleActiveBooking(previous, active.data || null)
    })()

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the account or its role changes
  }, [token, user?.id, userRole])

  // Signed in, the customer / driver shells set the title for each screen.
  useDocumentTitle(appMode === 'select' ? 'Roadside assistance' : !isAuthenticated ? (appMode === 'driver' ? 'Driver sign in' : 'Sign in') : null)

  // E6: the one sign-out; with nobody signed in this portal shows its sign-in screen.
  const handleLogout = () => { void signOut('user') }

  if (isRecoveringPassword) {
    return <PasswordRecoveryScreen onComplete={() => { setIsRecoveringPassword(false); setAppMode('customer') }} />
  }

  if (recoveryError) {
    return (
      <main className="auth-portal safe-top safe-bottom">
        <section className="auth-portal__content">
          <AidBrand compact label="ACCOUNT RECOVERY" />
          <div className="auth-portal__intro"><h1>That reset link did not work.</h1><p role="alert">{recoveryError}</p></div>
          <button type="button" className="aid-primary-button" onClick={() => { setRecoveryError(null); setAppMode('customer') }}>Request another link</button>
        </section>
      </main>
    )
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
