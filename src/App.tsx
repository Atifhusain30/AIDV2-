/**
 * AID App - Main Application Component
 * Supports both Customer and Driver portals
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  onSelectDriver 
}: { 
  onSelectCustomer: () => void
  onSelectDriver: () => void 
}) {
  const [showContent, setShowContent] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 1500)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <motion.div 
          className="absolute top-[-20%] right-[-15%] w-[60%] h-[60%] rounded-full"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(139, 92, 246, 0.12) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.5, 0.8, 0.5]
          }}
          transition={{ duration: 8, repeat: Infinity }}
        />
        <motion.div 
          className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(52, 211, 153, 0.1) 0%, transparent 70%)',
            filter: 'blur(50px)',
          }}
          animate={{
            scale: [1.1, 1, 1.1],
            opacity: [0.3, 0.6, 0.3]
          }}
          transition={{ duration: 6, repeat: Infinity }}
        />
      </div>

      <AnimatePresence mode="wait">
        {!showContent ? (
          // Logo Animation
          <motion.div
            key="logo"
            className="flex flex-col items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <motion.div
              className="w-24 h-24 rounded-3xl bg-gradient-to-br from-violet-500 via-purple-500 to-violet-600 flex items-center justify-center shadow-[0_0_60px_rgba(139,92,246,0.4)]"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            >
              <span className="text-white text-4xl font-bold">A</span>
            </motion.div>
            <motion.h1 
              className="text-4xl font-bold mt-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <span className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
                AID
              </span>
            </motion.h1>
          </motion.div>
        ) : (
          // Mode Selection
          <motion.div
            key="selection"
            className="w-full max-w-sm"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="text-center mb-10">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-500/30">
                <span className="text-white text-2xl font-bold">A</span>
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Welcome to AID</h1>
              <p className="text-gray-400">Choose how you'd like to continue</p>
            </div>

            <div className="space-y-4">
              {/* Customer Option */}
              <motion.button
                onClick={onSelectCustomer}
                className="w-full p-6 rounded-2xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 border border-violet-500/30 text-left group hover:border-violet-500/60 transition-colors"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                    <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-1">I Need Help</h3>
                    <p className="text-gray-400 text-sm">Request roadside assistance</p>
                  </div>
                  <svg className="w-5 h-5 text-violet-400 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </motion.button>

              {/* Driver Option */}
              <motion.button
                onClick={onSelectDriver}
                className="w-full p-6 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 text-left group hover:border-emerald-500/60 transition-colors"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                    <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-1">I'm a Driver</h3>
                    <p className="text-gray-400 text-sm">Provide services & earn</p>
                  </div>
                  <svg className="w-5 h-5 text-emerald-400 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
    <div className="min-h-screen bg-[#0a0a0f] flex justify-center">
      {/* Ambient Background Gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div 
          className="absolute top-[-20%] right-[-15%] w-[50%] h-[50%] rounded-full animate-pulse-slow"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(139, 92, 246, 0.15) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        <div 
          className="absolute bottom-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full animate-pulse-slow"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(99, 102, 241, 0.1) 0%, transparent 70%)',
            filter: 'blur(50px)',
            animationDelay: '-2s',
          }}
        />
      </div>

      {/* Subtle Star Particles */}
      {mounted && [...Array(15)].map((_, i) => (
        <div
          key={i}
          className="fixed rounded-full pointer-events-none"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            width: `${1 + Math.random() * 1.5}px`,
            height: `${1 + Math.random() * 1.5}px`,
            background: 'rgba(255, 255, 255, 0.3)',
            animation: `pulse ${2 + Math.random() * 3}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 2}s`,
          }}
        />
      ))}

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
          className="min-h-screen bg-[#0a0a0f] px-6 py-8 safe-top"
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
    
    // Initialize push notifications
    initNotifications()
    
    // Register handler for notification taps
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
