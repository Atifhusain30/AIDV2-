import { motion } from 'framer-motion'
import { Clock3, Home as House, UserRound } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'

// Home = request help (same behaviour as before). "Help & Support" lives only under Account,
// so no tab is called "Help" (Uber / DoorDash / Lyft all lead with Home).
const navItems = [
  { id: 'home', icon: House, label: 'Home' },
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
              <span className="aid-bottom-nav__icon"><Icon size={22} /></span>
              <span className="aid-bottom-nav__label">{item.label}</span>
            </button>
          )
        })}
      </motion.div>
    </nav>
  )
}
