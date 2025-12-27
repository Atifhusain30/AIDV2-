import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from './store/useAppStore'
import HomeScreen from './screens/HomeScreen'
import HistoryScreen from './screens/HistoryScreen'
import ChatScreen from './screens/ChatScreen'
import ProfileScreen from './screens/ProfileScreen'
import BottomNav from './components/ui/BottomNav'

function App() {
  const { currentScreen } = useAppStore()
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
      {/* Ambient Background Gradients - Full screen */}
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
        <div 
          className="absolute top-[40%] left-[50%] w-[30%] h-[30%] rounded-full animate-pulse-slow"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(168, 85, 247, 0.08) 0%, transparent 70%)',
            filter: 'blur(80px)',
            transform: 'translateX(-50%)',
            animationDelay: '-4s',
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
        {/* Main Content - scrollable */}
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

        {/* Bottom Navigation */}
        <BottomNav />
      </div>
    </div>
  )
}

export default App
