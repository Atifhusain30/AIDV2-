/**
 * AID App - Main Application Component
 * Supports both Customer and Driver portals
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Briefcase, Clock3, LifeBuoy, Link2Off as LinkIcon, MapPinned, ShieldCheck } from 'lucide-react'
import Button from './components/ui/Button'
import ChunkBoundary from './components/ui/ChunkBoundary'
import { SkeletonRows } from './components/ui/Skeleton'
import { lazyWithRetry } from './lib/lazyWithRetry'
import { useAppStore } from './store/useAppStore'
import { useAuthStore } from './store/useAuthStore'
import { useDriverStore } from './store/useDriverStore'
import { useJobLocationSharing } from './lib/useJobLocationSharing'
import { useDriverJobSync } from './lib/useDriverJobSync'
import { useActiveBookingSync } from './lib/useActiveBookingSync'
import { useRealtimeConnection } from './lib/useRealtimeConnection'
import EndedBookingNotice from './components/tracking/EndedBookingNotice'
import { registerNotificationTapHandler } from './lib/notifications'
import { syncAlertsIfAllowed } from './lib/alertsPrompt'
import AlertsExplainer from './components/AlertsExplainer'
import { apiService } from './services/api'
import { settleStaleActiveBooking } from './services/bookingService'
import type { Booking, Driver } from './types'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { supabase } from './auth/supabase'
import { installSessionWatch, signOut } from './auth/signOut'
import { completeRecoveryFromUrl } from './auth/recovery'
import PendingRatingReminder from './components/rating/PendingRatingReminder'
import { markRatingSkipped, type PendingRating } from './lib/ratings'
import { applyHistoryResult, markHistoryLoading } from './lib/bookingHistory'

// Customer Screens — Home and sign-in load with the app; everything else on demand (F6).
import HomeScreen from './screens/HomeScreen'
import { CustomerLoginScreen } from './screens/customer'
import BottomNav from './components/ui/BottomNav'
import OfflineBanner from './components/ui/OfflineBanner'
import AidBrand from './components/brand/AidBrand'
import DriverLoginScreen from './screens/driver/DriverLoginScreen'

const HistoryScreen = lazyWithRetry(() => import('./screens/HistoryScreen'))
const UpdatesScreen = lazyWithRetry(() => import('./screens/UpdatesScreen'))
const ProfileScreen = lazyWithRetry(() => import('./screens/ProfileScreen'))
const HelpSupportScreen = lazyWithRetry(() => import('./screens/HelpSupportScreen'))
const PasswordRecoveryScreen = lazyWithRetry(() => import('./components/auth/PasswordRecoveryScreen'))
const RatingSheet = lazyWithRetry(() => import('./components/rating/RatingSheet'))

// Driver Screens — never downloaded by a customer (F6).
const DriverHomeScreen = lazyWithRetry(() => import('./screens/driver/DriverHomeScreen'))
const DriverOnboardingScreen = lazyWithRetry(() => import('./screens/driver/DriverOnboardingScreen'))
const DriverJobScreen = lazyWithRetry(() => import('./screens/driver/DriverJobScreen'))
const DriverVehicleScreen = lazyWithRetry(() => import('./screens/driver/DriverVehicleScreen'))
const DriverSettingsScreen = lazyWithRetry(() => import('./screens/driver/DriverSettingsScreen'))

/** Shown for the moment a screen's code is loading (shapes only — F5). */
const screenFallback = <SkeletonRows count={4} />

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
    <main className="welcome safe-top safe-bottom">
      <motion.section
        className="welcome__inner"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <AidBrand />

        <div className="welcome__hero">
          <h1>Help, right when it matters.</h1>
          <p>Request roadside help and follow your driver live — or earn by helping drivers get moving again.</p>
          <ul className="welcome__trust" aria-label="Service benefits">
            <li><ShieldCheck size={16} aria-hidden="true" /> Verified drivers</li>
            <li><Clock3 size={16} aria-hidden="true" /> Clear arrival times</li>
            <li><MapPinned size={16} aria-hidden="true" /> Live progress</li>
          </ul>
        </div>

        <div className="welcome__roles">
          <button type="button" className="role-option role-option--primary" onClick={onSelectCustomer}>
            <span className="role-option__icon" aria-hidden="true"><LifeBuoy size={22} /></span>
            <span className="role-option__text"><strong>Get roadside help</strong><small>Request service and track it live</small></span>
            <ArrowRight size={20} aria-hidden="true" />
          </button>
          <button type="button" className="role-option" onClick={onSelectDriver}>
            <span className="role-option__icon" aria-hidden="true"><Briefcase size={22} /></span>
            <span className="role-option__text"><strong>Drive with AID</strong><small>Take nearby jobs on your schedule</small></span>
            <ArrowRight size={20} aria-hidden="true" />
          </button>
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
  // While a request is live, its tracking screen is full-screen (map + sheet): no tab bar to cover it.
  const immersive = currentScreen === 'chat' && hasLiveRequest
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
            className={`customer-main relative z-10 safe-top min-h-screen${immersive ? ' customer-main--immersive' : ''}`}
          >
            <ChunkBoundary fallback={screenFallback}>{renderScreen()}</ChunkBoundary>
          </motion.main>
        </AnimatePresence>

        {!immersive && <BottomNav />}
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
          <ChunkBoundary fallback={screenFallback}>
            <DriverHomeScreen
              onOpenOnboarding={() => setCurrentView('onboarding')}
              onOpenVehicle={() => openVehicle('home')}
              onOpenSettings={() => setCurrentView('settings')}
              onOpenActiveJob={() => setCurrentView('job')}
            />
          </ChunkBoundary>
        </motion.main>
      )}

      {currentView === 'onboarding' && (
        <motion.main
          key="onboarding"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <ChunkBoundary fallback={screenFallback}>
            <DriverOnboardingScreen
              onComplete={() => setCurrentView('home')}
              onSkip={() => setCurrentView('home')}
              onOpenVehicle={() => openVehicle('onboarding')}
            />
          </ChunkBoundary>
        </motion.main>
      )}

      {currentView === 'vehicle' && (
        <motion.main
          key="vehicle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <ChunkBoundary fallback={screenFallback}>
            <DriverVehicleScreen
              backLabel={vehicleReturn === 'onboarding' ? 'Back to verification' : vehicleReturn === 'settings' ? 'Back to settings' : 'Back to work'}
              onBack={() => setCurrentView(vehicleReturn)}
              onSaved={() => setCurrentView(vehicleReturn)}
            />
          </ChunkBoundary>
        </motion.main>
      )}

      {currentView === 'job' && (
        <motion.main
          key="job"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <ChunkBoundary fallback={screenFallback}>
            <DriverJobScreen
              onBack={() => setCurrentView('home')}
              onCompleted={(job) => void askToRate(job)}
            />
          </ChunkBoundary>
        </motion.main>
      )}

      {currentView === 'help' && (
        <motion.main key="help" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="driver-help">
          <ChunkBoundary fallback={screenFallback}>
            <HelpSupportScreen audience="driver" onBack={() => setCurrentView('settings')} />
          </ChunkBoundary>
        </motion.main>
      )}

      {currentView === 'settings' && (
        <motion.main
          key="settings"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="ui-screen driver-settings safe-top"
        >
          <ChunkBoundary fallback={screenFallback}>
            <DriverSettingsScreen
              onBack={() => setCurrentView('home')}
              onOpenDocuments={() => setCurrentView('onboarding')}
              onOpenVehicle={() => openVehicle('settings')}
              onOpenHelp={() => setCurrentView('help')}
              onLogout={onLogout}
            />
          </ChunkBoundary>
        </motion.main>
      )}
    </AnimatePresence>
    {/* Mounted once per app open so the reminder runs once (never re-triggered by the sheet below). */}
    <PendingRatingReminder userId={user?.id} />
    {rateCustomer && (
      <ChunkBoundary>
        <RatingSheet
          pending={rateCustomer}
          context="after_job"
          onRated={() => setRateCustomer(null)}
          onSkip={() => { if (user) markRatingSkipped(user.id, rateCustomer.bookingId); setRateCustomer(null) }}
        />
      </ChunkBoundary>
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
      // Deep links only exist in the phone app; in a web preview these calls can fail with no link at all.
      .catch(() => { if (Capacitor.isNativePlatform()) setRecoveryError('Unable to initialize password recovery links.') })
    void CapacitorApp.getLaunchUrl()
      .then((launch) => { if (launch?.url) void handleUrl(launch.url) })
      .catch(() => { if (Capacitor.isNativePlatform()) setRecoveryError('Unable to read the password recovery link.') })
    return () => {
      cancelled = true
      void listener?.remove()
    }
  }, [])

  // Check for existing session
  useEffect(() => {
    if (isAuthenticated && user) {
      setAppMode(user.role === 'driver' ? 'driver' : 'customer')
      // Never ask for notification permission here (sign-in / app start). The ask comes after an
      // in-app explainer at a useful moment (first request / first time online — alertsPrompt.ts);
      // this only sets up the channel when alerts were already allowed.
      void syncAlertsIfAllowed()
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

      markHistoryLoading()
      // The garage loads with the rest, so Home shows the saved vehicle (and a request is two taps)
      // without first visiting Account — found on the iPhone simulator.
      const [history, active, garage] = await Promise.all([apiService.listBookings(), apiService.getActiveBooking(), apiService.listVehicles()])
      if (cancelled) return
      const store = useAppStore.getState()
      if (garage.success && garage.data) store.setVehicles(garage.data)
      const previous = store.activeBooking
      // F5: Activity shows a skeleton until this answers, then the list or an error with Try again.
      if (history.success && history.data) store.clearBookings()
      applyHistoryResult(history)
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
    return (
      <ChunkBoundary fallback={screenFallback}>
        <PasswordRecoveryScreen onComplete={() => { setIsRecoveringPassword(false); setAppMode('customer') }} />
      </ChunkBoundary>
    )
  }

  if (recoveryError) {
    return (
      <main className="auth safe-top safe-bottom">
        <section className="auth__inner">
          <header className="auth__top"><AidBrand compact /></header>
          <div className="auth__done">
            <span className="auth__done-icon auth__done-icon--error" aria-hidden="true"><LinkIcon size={24} /></span>
            <h1>That reset link didn't work</h1>
            <p role="alert">{recoveryError}</p>
            <p className="auth__muted">Links expire after a while and work once. Ask for a new one from sign in.</p>
            <Button block size="lg" onClick={() => { setRecoveryError(null); setAppMode('customer') }}>Request another link</Button>
          </div>
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
    return <><CustomerApp /><AlertsExplainer /></>
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
    return <><DriverApp onLogout={handleLogout} /><AlertsExplainer /></>
  }

  return null
}export default App
