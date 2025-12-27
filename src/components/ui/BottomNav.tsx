import { motion, AnimatePresence } from 'framer-motion'
import { Home, Clock, MessageCircle, User } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'

const navItems = [
  { id: 'home', icon: Home, label: 'Home' },
  { id: 'history', icon: Clock, label: 'History' },
  { id: 'chat', icon: MessageCircle, label: 'Chat' },
  { id: 'profile', icon: User, label: 'Profile' },
] as const

export default function BottomNav() {
  const { currentScreen, setCurrentScreen, setActiveModal } = useAppStore()

  const handleNavClick = (id: typeof navItems[number]['id']) => {
    if (id === 'history') {
      setActiveModal('history')
    } else {
      setCurrentScreen(id as 'home' | 'history' | 'chat' | 'profile')
    }
  }

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-30 px-4 pb-2 safe-bottom">
      <motion.div 
        className="rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(26, 26, 46, 0.95) 0%, rgba(22, 33, 62, 0.95) 100%)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 -4px 30px rgba(0, 0, 0, 0.3), 0 0 20px rgba(139, 92, 246, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      >
        <div className="flex justify-around items-center py-3 px-2">
          {navItems.map((item, index) => {
            const Icon = item.icon
            const isActive = currentScreen === item.id
            
            return (
              <motion.button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className="relative flex flex-col items-center gap-1 py-2 px-4 rounded-xl transition-colors"
                whileTap={{ scale: 0.9 }}
                whileHover={{ scale: 1.05 }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      layoutId="activeNavBg"
                      className="absolute inset-0 bg-iris-500/20 rounded-xl"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                    />
                  )}
                </AnimatePresence>
                <motion.div
                  animate={{
                    scale: isActive ? 1.1 : 1,
                    y: isActive ? -2 : 0,
                  }}
                  transition={{ type: 'spring', stiffness: 400 }}
                >
                  <Icon 
                    size={22}
                    strokeWidth={isActive ? 2 : 1.5}
                    className={`relative z-10 transition-all duration-200 ${
                      isActive 
                        ? 'text-iris-300 icon-glow' 
                        : 'text-white/40'
                    }`}
                  />
                </motion.div>
                <motion.span 
                  className={`relative z-10 text-[10px] font-medium tracking-wide transition-colors ${
                    isActive ? 'text-iris-300' : 'text-white/40'
                  }`}
                  animate={{
                    opacity: isActive ? 1 : 0.6,
                  }}
                >
                  {item.label}
                </motion.span>
              </motion.button>
            )
          })}
        </div>
      </motion.div>
    </nav>
  )
}
