import { motion } from 'framer-motion'
import { 
  User, 
  Car, 
  MapPin, 
  CreditCard, 
  Bell, 
  Shield, 
  HelpCircle, 
  LogOut, 
  ChevronRight 
} from 'lucide-react'
import { userVehicles, savedAddresses } from '../data/mockData'

const menuItems = [
  { icon: User, label: 'Edit Profile' },
  { icon: Car, label: 'My Vehicles', count: userVehicles.length },
  { icon: MapPin, label: 'Saved Addresses', count: savedAddresses.length },
  { icon: CreditCard, label: 'Payment Methods' },
  { icon: Bell, label: 'Notifications' },
  { icon: Shield, label: 'Privacy & Security' },
  { icon: HelpCircle, label: 'Help & Support' },
]

export default function ProfileScreen() {
  return (
    <div className="max-w-md mx-auto px-5 py-6">
      {/* Profile Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-elevated rounded-3xl p-6 mb-6 text-center"
      >
        <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-iris-500/40 to-iris-600/30 border-2 border-iris-500/40 flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(139,92,246,0.3)]">
          <User size={32} strokeWidth={1.5} className="text-iris-200" />
        </div>
        <h2 className="text-white text-lg font-semibold mb-0.5">John Doe</h2>
        <p className="text-white/40 text-sm mb-5">john.doe@email.com</p>
        <div className="flex justify-center gap-8">
          <div className="text-center">
            <p className="text-iris-300 text-xl font-semibold">12</p>
            <p className="text-white/40 text-xs">Services</p>
          </div>
          <div className="w-px bg-white/10" />
          <div className="text-center">
            <p className="text-iris-300 text-xl font-semibold">4.9</p>
            <p className="text-white/40 text-xs">Rating</p>
          </div>
          <div className="w-px bg-white/10" />
          <div className="text-center">
            <p className="text-iris-300 text-xl font-semibold">2</p>
            <p className="text-white/40 text-xs">Vehicles</p>
          </div>
        </div>
      </motion.div>

      {/* Menu Items */}
      <div className="space-y-2">
        {menuItems.map((item, i) => {
          const Icon = item.icon
          return (
            <motion.button
              key={item.label}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass w-full rounded-2xl p-4 flex items-center gap-4 hover:bg-white/5 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-iris-500/15 flex items-center justify-center">
                <Icon size={18} strokeWidth={1.5} className="text-iris-300" />
              </div>
              <span className="flex-1 text-white/80 text-sm text-left">{item.label}</span>
              {item.count !== undefined && (
                <span className="text-white/40 text-sm">{item.count}</span>
              )}
              <ChevronRight size={16} strokeWidth={1.5} className="text-white/20" />
            </motion.button>
          )
        })}

        {/* Logout */}
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: menuItems.length * 0.05 }}
          className="glass w-full rounded-2xl p-4 flex items-center gap-4 hover:bg-rose-500/10 transition-colors mt-4"
        >
          <div className="w-10 h-10 rounded-xl bg-rose-500/15 flex items-center justify-center">
            <LogOut size={18} strokeWidth={1.5} className="text-rose-400" />
          </div>
          <span className="flex-1 text-rose-400 text-sm text-left">Log Out</span>
        </motion.button>
      </div>

      {/* App Version */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-center text-white/20 text-xs mt-8"
      >
        AID v1.0.0
      </motion.p>
    </div>
  )
}



