import { motion } from 'framer-motion'
import { Clock3, LifeBuoy, UserRound } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'

const navItems = [
  { id: 'home', icon: LifeBuoy, label: 'Help' },
  { id: 'history', icon: Clock3, label: 'Activity' },
  { id: 'profile', icon: UserRound, label: 'Account' },
] as const

export default function BottomNav() {
  const { currentScreen, setCurrentScreen, setActiveModal } = useAppStore()

  const handleNavClick = (id: typeof navItems[number]['id']) => {
    setCurrentScreen(id)
    setActiveModal(null)
  }

  return (
    <nav className="aid-bottom-nav safe-bottom" aria-label="Customer navigation">
      <motion.div
        className="aid-bottom-nav__rail"
        initial={{ y: 70, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
      >
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = currentScreen === item.id

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              className={`aid-bottom-nav__item ${isActive ? 'is-active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
            >
              {isActive && (
                <motion.span
                  className="aid-bottom-nav__active"
                  layoutId="aid-active-nav"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}
              <span className="aid-bottom-nav__icon"><Icon size={21} strokeWidth={isActive ? 2.35 : 1.8} /></span>
              <span className="aid-bottom-nav__label">{item.label}</span>
            </button>
          )
        })}
      </motion.div>
    </nav>
  )
}
