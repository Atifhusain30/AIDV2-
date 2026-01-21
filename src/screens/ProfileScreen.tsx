import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  User,
  UserCog, 
  Car, 
  MapPin, 
  CreditCard, 
  Bell, 
  Shield, 
  HelpCircle, 
  LogOut, 
  ChevronRight,
  ChevronLeft,
  Camera,
  Plus,
  X,
  Edit2,
  Trash2,
  Star,
  MoreVertical,
  Home,
  Building2,
  Mail,
  MessageSquare,
  Truck,
  Tag,
  Clock,
  Newspaper,
  Loader2,
  Check,
  Phone,
} from 'lucide-react'
import { useAppStore, UserVehicle } from '../store/useAppStore'

// Legacy types for non-persisted local data
interface UserData {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  createdAt: Date
}

// Legacy vehicle type for non-persisted local state components
interface LegacyVehicle {
  id: string
  nickname: string
  make: string
  model: string
  year: number
  color: string
  licensePlate: string
  isDefault: boolean
}

interface SavedAddress {
  id: string
  label: string
  address: string
  apartment?: string
  city: string
  state: string
  zipCode: string
  isDefault: boolean
}

interface PaymentMethod {
  id: string
  type: 'card' | 'apple_pay' | 'google_pay'
  brand?: 'visa' | 'mastercard' | 'amex' | 'discover'
  last4?: string
  expiryMonth?: number
  expiryYear?: number
  isDefault: boolean
}

interface NotificationSettings {
  pushEnabled: boolean
  emailEnabled: boolean
  smsEnabled: boolean
  categories: {
    serviceUpdates: boolean
    promotions: boolean
    reminders: boolean
    news: boolean
  }
}

// Sample Data
const initialUser: UserData = {
  id: 'user_001',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@email.com',
  phone: '+1 (555) 123-4567',
  createdAt: new Date('2024-06-15'),
}

const initialVehicles: LegacyVehicle[] = [
  {
    id: 'veh_1',
    nickname: 'My Tesla',
    make: 'Tesla',
    model: 'Model 3',
    year: 2023,
    color: 'White',
    licensePlate: 'ABC-1234',
    isDefault: true,
  },
  {
    id: 'veh_2',
    nickname: 'Family SUV',
    make: 'Toyota',
    model: 'RAV4',
    year: 2021,
    color: 'Silver',
    licensePlate: 'XYZ-5678',
    isDefault: false,
  },
]

const initialAddresses: SavedAddress[] = [
  {
    id: 'addr_1',
    label: 'Home',
    address: '123 Main Street',
    apartment: 'Apt 4B',
    city: 'Dallas',
    state: 'TX',
    zipCode: '75201',
    isDefault: true,
  },
  {
    id: 'addr_2',
    label: 'Work',
    address: '456 Corporate Blvd',
    city: 'Plano',
    state: 'TX',
    zipCode: '75024',
    isDefault: false,
  },
]

const initialPayments: PaymentMethod[] = [
  {
    id: 'pm_1',
    type: 'card',
    brand: 'visa',
    last4: '4242',
    expiryMonth: 12,
    expiryYear: 2027,
    isDefault: true,
  },
  {
    id: 'pm_2',
    type: 'apple_pay',
    isDefault: false,
  },
]

const initialNotifications: NotificationSettings = {
  pushEnabled: true,
  emailEnabled: true,
  smsEnabled: false,
  categories: {
    serviceUpdates: true,
    promotions: false,
    reminders: true,
    news: false,
  },
}

// Helper Functions
const formatDate = (date: Date) => {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

const getVehicleColor = (color: string) => {
  const colors: Record<string, string> = {
    White: '#f0f0f0',
    Black: '#1a1a1a',
    Silver: '#a0a0a0',
    Red: '#dc2626',
    Blue: '#2563eb',
    Green: '#16a34a',
    Gray: '#6b7280',
  }
  return colors[color] || '#6b7280'
}

// Toggle Component
function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <motion.button
      onClick={onToggle}
      className={`w-12 h-7 rounded-full p-1 transition-colors ${
        enabled ? 'bg-emerald-500' : 'bg-white/10'
      }`}
      whileTap={{ scale: 0.95 }}
    >
      <motion.div
        className="w-5 h-5 bg-white rounded-full shadow-md"
        animate={{ x: enabled ? 20 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </motion.button>
  )
}

// Form Input Component
function FormInput({ 
  label, 
  value, 
  onChange, 
  type = 'text', 
  placeholder 
}: { 
  label: string
  value: string | number
  onChange: (val: string) => void
  type?: string
  placeholder?: string 
}) {
  const [isFocused, setIsFocused] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <label className="block text-sm font-medium text-gray-400 mb-2">
        {label}
      </label>
      <motion.div
        animate={{
          borderColor: isFocused ? '#10b981' : 'rgba(255,255,255,0.1)',
          boxShadow: isFocused ? '0 0 0 3px rgba(16,185,129,0.1)' : 'none',
        }}
        className="bg-white/5 rounded-xl border border-white/10 overflow-hidden"
      >
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          className="w-full bg-transparent px-4 py-3.5 text-white placeholder-gray-500 outline-none"
        />
      </motion.div>
    </motion.div>
  )
}

// Dropdown Menu Component
function DropdownMenu({ items }: { items: Array<{ label: string; icon: React.ElementType; onPress: () => void; destructive?: boolean }> }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative">
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(!isOpen)}
        className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center"
      >
        <MoreVertical size={16} className="text-gray-400" />
      </motion.button>
      
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -10 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-2 w-48 bg-[#1a1a3a] rounded-xl border border-white/10 overflow-hidden z-50 shadow-xl"
            >
              {items.map((item, index) => (
                <motion.button
                  key={index}
                  whileHover={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
                  onClick={() => { item.onPress(); setIsOpen(false); }}
                  className={`w-full px-4 py-3 flex items-center gap-3 text-left ${
                    item.destructive ? 'text-red-400' : 'text-white'
                  }`}
                >
                  <item.icon size={16} />
                  <span className="text-sm">{item.label}</span>
                </motion.button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// Delete Confirmation Modal
function DeleteConfirmModal({ 
  title, 
  message, 
  onConfirm, 
  onCancel 
}: { 
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void 
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-sm bg-[#1a1a3a] rounded-3xl p-6"
      >
        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
          <Trash2 size={28} className="text-red-400" />
        </div>
        
        <h3 className="text-xl font-semibold text-center text-white mb-2">{title}</h3>
        <p className="text-gray-400 text-center mb-6">{message}</p>
        
        <div className="flex gap-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl bg-white/10 font-medium text-white"
          >
            Cancel
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl bg-red-500 text-white font-medium"
          >
            Delete
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// Sub-screen Wrapper
function SubScreen({ 
  title, 
  onBack, 
  children, 
  actionButton 
}: { 
  title: string
  onBack: () => void
  children: React.ReactNode
  actionButton?: React.ReactNode 
}) {
  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="fixed inset-0 bg-[#0a0a0f] z-40 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/5">
        <motion.button
          whileHover={{ scale: 1.1, x: -2 }}
          whileTap={{ scale: 0.9 }}
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white"
        >
          <ChevronLeft size={20} />
        </motion.button>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto hide-scrollbar">
        {children}
      </div>
      
      {/* Bottom Action */}
      {actionButton && (
        <div className="p-4 border-t border-white/5 bg-[#0a0a0f] safe-bottom">
          {actionButton}
        </div>
      )}
    </motion.div>
  )
}

// Edit Profile Screen
function EditProfileScreen({ user, onBack, onSave }: { user: UserData; onBack: () => void; onSave: (user: UserData) => void }) {
  const [formData, setFormData] = useState({
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
  })
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  const handleChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value })
    setHasChanges(true)
  }

  const handleSave = async () => {
    setIsSaving(true)
    await new Promise(r => setTimeout(r, 1000))
    onSave({ ...user, ...formData })
    setIsSaving(false)
    onBack()
  }

  return (
    <SubScreen
      title="Edit Profile"
      onBack={onBack}
      actionButton={
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          disabled={!hasChanges || isSaving}
          onClick={handleSave}
          className={`w-full py-4 rounded-2xl font-semibold flex items-center justify-center ${
            hasChanges
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white'
              : 'bg-white/10 text-gray-500'
          }`}
        >
          {isSaving ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            'Save Changes'
          )}
        </motion.button>
      }
    >
      <div className="p-6 space-y-6">
        {/* Avatar Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center"
        >
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-2xl font-bold text-white">
              {formData.firstName[0]}{formData.lastName[0]}
            </div>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="absolute bottom-0 right-0 w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white"
            >
              <Camera size={16} />
            </motion.button>
          </div>
          <p className="text-sm text-gray-400 mt-3">Tap to change photo</p>
        </motion.div>
        
        {/* Form Fields */}
        <div className="space-y-4">
          <FormInput
            label="First Name"
            value={formData.firstName}
            onChange={(v) => handleChange('firstName', v)}
          />
          <FormInput
            label="Last Name"
            value={formData.lastName}
            onChange={(v) => handleChange('lastName', v)}
          />
          <FormInput
            label="Email"
            type="email"
            value={formData.email}
            onChange={(v) => handleChange('email', v)}
          />
          <FormInput
            label="Phone"
            type="tel"
            value={formData.phone}
            onChange={(v) => handleChange('phone', v)}
          />
        </div>
      </div>
    </SubScreen>
  )
}

// Vehicle Form Modal (Legacy - non-persisted)
function VehicleFormModal({ 
  vehicle, 
  onClose, 
  onSave 
}: { 
  vehicle: LegacyVehicle | null
  onClose: () => void
  onSave: (vehicle: LegacyVehicle) => void 
}) {
  const [formData, setFormData] = useState<Omit<LegacyVehicle, 'id'>>(
    vehicle || {
      nickname: '',
      make: '',
      model: '',
      year: new Date().getFullYear(),
      color: 'White',
      licensePlate: '',
      isDefault: false,
    }
  )
  const [isSaving, setIsSaving] = useState(false)

  const colors = ['White', 'Black', 'Silver', 'Red', 'Blue', 'Green', 'Gray']

  const handleSave = async () => {
    setIsSaving(true)
    await new Promise(r => setTimeout(r, 800))
    onSave({ ...formData, id: vehicle?.id || `veh_${Date.now()}` })
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end"
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="w-full bg-[#12122a] rounded-t-3xl max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <h3 className="text-lg font-semibold text-white">
            {vehicle ? 'Edit Vehicle' : 'Add Vehicle'}
          </h3>
          <motion.button
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white"
          >
            <X size={18} />
          </motion.button>
        </div>
        
        {/* Form */}
        <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
          <FormInput
            label="Nickname"
            placeholder="My Car"
            value={formData.nickname}
            onChange={(v) => setFormData({...formData, nickname: v})}
          />
          
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Make"
              placeholder="Toyota"
              value={formData.make}
              onChange={(v) => setFormData({...formData, make: v})}
            />
            <FormInput
              label="Model"
              placeholder="Camry"
              value={formData.model}
              onChange={(v) => setFormData({...formData, model: v})}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Year"
              type="number"
              value={formData.year}
              onChange={(v) => setFormData({...formData, year: parseInt(v) || 2024})}
            />
            <FormInput
              label="License Plate"
              placeholder="ABC-1234"
              value={formData.licensePlate}
              onChange={(v) => setFormData({...formData, licensePlate: v.toUpperCase()})}
            />
          </div>
          
          {/* Color Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-3">Color</label>
            <div className="flex gap-2 flex-wrap">
              {colors.map((color) => (
                <motion.button
                  key={color}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setFormData({...formData, color})}
                  className={`w-10 h-10 rounded-full border-2 ${
                    formData.color === color ? 'border-emerald-500' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: getVehicleColor(color) }}
                />
              ))}
            </div>
          </div>
        </div>
        
        {/* Save Button */}
        <div className="p-4 border-t border-white/5">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSave}
            disabled={isSaving || !formData.make || !formData.model}
            className="w-full py-4 rounded-2xl font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 text-white flex items-center justify-center disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={20} className="animate-spin" /> : 'Save Vehicle'}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// Vehicle Card (Legacy - non-persisted)
function VehicleCard({ 
  vehicle, 
  onEdit, 
  onSetDefault, 
  onDelete 
}: { 
  vehicle: LegacyVehicle
  onEdit: () => void
  onSetDefault: () => void
  onDelete: () => void 
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      className="bg-white/5 rounded-2xl p-4 border border-white/5"
    >
      <div className="flex items-start gap-4">
        <div 
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: getVehicleColor(vehicle.color) }}
        >
          <Car size={24} className="text-white" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white truncate">{vehicle.nickname}</h3>
            {vehicle.isDefault && (
              <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                Default
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </p>
          <p className="text-xs text-gray-500 mt-1">{vehicle.licensePlate}</p>
        </div>
        
        <DropdownMenu
          items={[
            { label: 'Edit', icon: Edit2, onPress: onEdit },
            ...(!vehicle.isDefault ? [{ label: 'Set as Default', icon: Star, onPress: onSetDefault }] : []),
            { label: 'Delete', icon: Trash2, onPress: onDelete, destructive: true },
          ]}
        />
      </div>
    </motion.div>
  )
}

// Vehicles Screen (Legacy - non-persisted, kept for addresses/payments sections)
function VehiclesScreen({ 
  vehicles, 
  onBack, 
  onUpdate 
}: { 
  vehicles: LegacyVehicle[]
  onBack: () => void
  onUpdate: (vehicles: LegacyVehicle[]) => void 
}) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState<LegacyVehicle | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  const handleSetDefault = (id: string) => {
    onUpdate(vehicles.map(v => ({ ...v, isDefault: v.id === id })))
  }

  const handleDelete = (id: string) => {
    onUpdate(vehicles.filter(v => v.id !== id))
    setShowDeleteConfirm(null)
  }

  const handleSave = (vehicle: LegacyVehicle) => {
    if (editingVehicle) {
      onUpdate(vehicles.map(v => v.id === vehicle.id ? vehicle : v))
    } else {
      onUpdate([...vehicles, vehicle])
    }
    setShowAddModal(false)
    setEditingVehicle(null)
  }

  return (
    <SubScreen
      title="My Vehicles"
      onBack={onBack}
      actionButton={
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowAddModal(true)}
          className="w-full py-4 rounded-2xl font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 text-white flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          Add Vehicle
        </motion.button>
      }
    >
      <div className="p-6 space-y-3">
        <AnimatePresence>
          {vehicles.map((vehicle, index) => (
            <motion.div
              key={vehicle.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20, height: 0 }}
              transition={{ delay: index * 0.05 }}
              layout
            >
              <VehicleCard
                vehicle={vehicle}
                onEdit={() => setEditingVehicle(vehicle)}
                onSetDefault={() => handleSetDefault(vehicle.id)}
                onDelete={() => setShowDeleteConfirm(vehicle.id)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
        
        {vehicles.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <Car size={48} className="mx-auto text-gray-600 mb-4" />
            <p className="text-gray-400">No vehicles added yet</p>
          </motion.div>
        )}
      </div>
      
      {/* Add/Edit Modal */}
      <AnimatePresence>
        {(showAddModal || editingVehicle) && (
          <VehicleFormModal
            vehicle={editingVehicle}
            onClose={() => { setShowAddModal(false); setEditingVehicle(null); }}
            onSave={handleSave}
          />
        )}
      </AnimatePresence>
      
      {/* Delete Confirmation */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <DeleteConfirmModal
            title="Delete Vehicle?"
            message="This action cannot be undone."
            onConfirm={() => handleDelete(showDeleteConfirm)}
            onCancel={() => setShowDeleteConfirm(null)}
          />
        )}
      </AnimatePresence>
    </SubScreen>
  )
}

// Address Card
function AddressCard({ 
  address, 
  onEdit, 
  onSetDefault, 
  onDelete 
}: { 
  address: SavedAddress
  onEdit: () => void
  onSetDefault: () => void
  onDelete: () => void 
}) {
  const labelIcons: Record<string, React.ElementType> = {
    Home: Home,
    Work: Building2,
  }
  const LabelIcon = labelIcons[address.label] || MapPin

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      className="bg-white/5 rounded-2xl p-4 border border-white/5"
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
          <LabelIcon size={22} className="text-purple-400" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white">{address.label}</h3>
            {address.isDefault && (
              <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                Default
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400 truncate">
            {address.address}{address.apartment ? `, ${address.apartment}` : ''}
          </p>
          <p className="text-xs text-gray-500">{address.city}, {address.state} {address.zipCode}</p>
        </div>
        
        <DropdownMenu
          items={[
            { label: 'Edit', icon: Edit2, onPress: onEdit },
            ...(!address.isDefault ? [{ label: 'Set as Default', icon: Star, onPress: onSetDefault }] : []),
            { label: 'Delete', icon: Trash2, onPress: onDelete, destructive: true },
          ]}
        />
      </div>
    </motion.div>
  )
}

// Address Form Modal
function AddressFormModal({ 
  address, 
  onClose, 
  onSave 
}: { 
  address: SavedAddress | null
  onClose: () => void
  onSave: (address: SavedAddress) => void 
}) {
  const [formData, setFormData] = useState<Omit<SavedAddress, 'id'>>(
    address || {
      label: 'Home',
      address: '',
      apartment: '',
      city: '',
      state: '',
      zipCode: '',
      isDefault: false,
    }
  )
  const [isSaving, setIsSaving] = useState(false)

  const labels = ['Home', 'Work', 'Gym', 'Other']

  const handleSave = async () => {
    setIsSaving(true)
    await new Promise(r => setTimeout(r, 800))
    onSave({ ...formData, id: address?.id || `addr_${Date.now()}` })
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end"
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="w-full bg-[#12122a] rounded-t-3xl max-h-[90vh] overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <h3 className="text-lg font-semibold text-white">
            {address ? 'Edit Address' : 'Add Address'}
          </h3>
          <motion.button
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white"
          >
            <X size={18} />
          </motion.button>
        </div>
        
        <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
          {/* Label Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-3">Label</label>
            <div className="flex gap-2 flex-wrap">
              {labels.map((label) => (
                <motion.button
                  key={label}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setFormData({...formData, label})}
                  className={`px-4 py-2 rounded-xl text-sm font-medium ${
                    formData.label === label 
                      ? 'bg-emerald-500 text-white' 
                      : 'bg-white/5 text-gray-400'
                  }`}
                >
                  {label}
                </motion.button>
              ))}
            </div>
          </div>
          
          <FormInput
            label="Street Address"
            placeholder="123 Main Street"
            value={formData.address}
            onChange={(v) => setFormData({...formData, address: v})}
          />
          
          <FormInput
            label="Apt, Suite, etc. (optional)"
            placeholder="Apt 4B"
            value={formData.apartment || ''}
            onChange={(v) => setFormData({...formData, apartment: v})}
          />
          
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="City"
              placeholder="Dallas"
              value={formData.city}
              onChange={(v) => setFormData({...formData, city: v})}
            />
            <FormInput
              label="State"
              placeholder="TX"
              value={formData.state}
              onChange={(v) => setFormData({...formData, state: v.toUpperCase()})}
            />
          </div>
          
          <FormInput
            label="ZIP Code"
            placeholder="75201"
            value={formData.zipCode}
            onChange={(v) => setFormData({...formData, zipCode: v})}
          />
        </div>
        
        <div className="p-4 border-t border-white/5">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSave}
            disabled={isSaving || !formData.address || !formData.city}
            className="w-full py-4 rounded-2xl font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 text-white flex items-center justify-center disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={20} className="animate-spin" /> : 'Save Address'}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// Addresses Screen
function AddressesScreen({ 
  addresses, 
  onBack, 
  onUpdate 
}: { 
  addresses: SavedAddress[]
  onBack: () => void
  onUpdate: (addresses: SavedAddress[]) => void 
}) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingAddress, setEditingAddress] = useState<SavedAddress | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  const handleSetDefault = (id: string) => {
    onUpdate(addresses.map(a => ({ ...a, isDefault: a.id === id })))
  }

  const handleDelete = (id: string) => {
    onUpdate(addresses.filter(a => a.id !== id))
    setShowDeleteConfirm(null)
  }

  const handleSave = (address: SavedAddress) => {
    if (editingAddress) {
      onUpdate(addresses.map(a => a.id === address.id ? address : a))
    } else {
      onUpdate([...addresses, address])
    }
    setShowAddModal(false)
    setEditingAddress(null)
  }

  return (
    <SubScreen
      title="Saved Addresses"
      onBack={onBack}
      actionButton={
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowAddModal(true)}
          className="w-full py-4 rounded-2xl font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 text-white flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          Add Address
        </motion.button>
      }
    >
      <div className="p-6 space-y-3">
        {addresses.map((address, index) => (
          <motion.div
            key={address.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <AddressCard
              address={address}
              onEdit={() => setEditingAddress(address)}
              onSetDefault={() => handleSetDefault(address.id)}
              onDelete={() => setShowDeleteConfirm(address.id)}
            />
          </motion.div>
        ))}
        
        {addresses.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <MapPin size={48} className="mx-auto text-gray-600 mb-4" />
            <p className="text-gray-400">No addresses saved yet</p>
          </motion.div>
        )}
      </div>
      
      <AnimatePresence>
        {(showAddModal || editingAddress) && (
          <AddressFormModal
            address={editingAddress}
            onClose={() => { setShowAddModal(false); setEditingAddress(null); }}
            onSave={handleSave}
          />
        )}
      </AnimatePresence>
      
      <AnimatePresence>
        {showDeleteConfirm && (
          <DeleteConfirmModal
            title="Delete Address?"
            message="This action cannot be undone."
            onConfirm={() => handleDelete(showDeleteConfirm)}
            onCancel={() => setShowDeleteConfirm(null)}
          />
        )}
      </AnimatePresence>
    </SubScreen>
  )
}

// Payments Screen
function PaymentsScreen({ 
  payments, 
  onBack, 
  onUpdate 
}: { 
  payments: PaymentMethod[]
  onBack: () => void
  onUpdate: (payments: PaymentMethod[]) => void 
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  const handleSetDefault = (id: string) => {
    onUpdate(payments.map(p => ({ ...p, isDefault: p.id === id })))
  }

  const handleDelete = (id: string) => {
    onUpdate(payments.filter(p => p.id !== id))
    setShowDeleteConfirm(null)
  }

  return (
    <SubScreen
      title="Payment Methods"
      onBack={onBack}
      actionButton={
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full py-4 rounded-2xl font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 text-white flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          Add Payment Method
        </motion.button>
      }
    >
      <div className="p-6 space-y-3">
        {payments.map((payment, index) => (
          <motion.div
            key={payment.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="bg-white/5 rounded-2xl p-4 border border-white/5"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <CreditCard size={24} className="text-purple-400" />
              </div>
              
              <div className="flex-1">
                {payment.type === 'card' ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white capitalize">{payment.brand}</span>
                      {payment.isDefault && (
                        <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400">•••• {payment.last4}</p>
                    <p className="text-xs text-gray-500">Expires {payment.expiryMonth}/{payment.expiryYear}</p>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">
                      {payment.type === 'apple_pay' ? 'Apple Pay' : 'Google Pay'}
                    </span>
                    {payment.isDefault && (
                      <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                        Default
                      </span>
                    )}
                  </div>
                )}
              </div>
              
              <DropdownMenu
                items={[
                  ...(!payment.isDefault ? [{ label: 'Set as Default', icon: Star, onPress: () => handleSetDefault(payment.id) }] : []),
                  { label: 'Remove', icon: Trash2, onPress: () => setShowDeleteConfirm(payment.id), destructive: true },
                ]}
              />
            </div>
          </motion.div>
        ))}
        
        {payments.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <CreditCard size={48} className="mx-auto text-gray-600 mb-4" />
            <p className="text-gray-400">No payment methods added</p>
          </motion.div>
        )}
      </div>
      
      <AnimatePresence>
        {showDeleteConfirm && (
          <DeleteConfirmModal
            title="Remove Payment Method?"
            message="This action cannot be undone."
            onConfirm={() => handleDelete(showDeleteConfirm)}
            onCancel={() => setShowDeleteConfirm(null)}
          />
        )}
      </AnimatePresence>
    </SubScreen>
  )
}

// Toggle Row Component
function ToggleRow({ 
  icon: Icon, 
  label, 
  description, 
  enabled, 
  onToggle 
}: { 
  icon: React.ElementType
  label: string
  description: string
  enabled: boolean
  onToggle: () => void 
}) {
  return (
    <motion.div
      whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
      className="bg-white/5 rounded-2xl p-4 flex items-center gap-4"
    >
      <div className="w-11 h-11 rounded-xl bg-purple-500/20 flex items-center justify-center">
        <Icon size={20} className="text-purple-400" />
      </div>
      
      <div className="flex-1">
        <h4 className="font-medium text-white">{label}</h4>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      
      <Toggle enabled={enabled} onToggle={onToggle} />
    </motion.div>
  )
}

// Notifications Screen
function NotificationsScreen({ 
  settings, 
  onBack, 
  onUpdate 
}: { 
  settings: NotificationSettings
  onBack: () => void
  onUpdate: (settings: NotificationSettings) => void 
}) {
  const toggleSetting = (key: keyof Omit<NotificationSettings, 'categories'>) => {
    onUpdate({ ...settings, [key]: !settings[key] })
  }

  const toggleCategory = (category: keyof NotificationSettings['categories']) => {
    onUpdate({
      ...settings,
      categories: {
        ...settings.categories,
        [category]: !settings.categories[category],
      },
    })
  }

  return (
    <SubScreen title="Notifications" onBack={onBack}>
      <div className="p-6 space-y-6">
        {/* Main Toggles */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <h3 className="text-sm font-medium text-gray-400 mb-3">Notification Channels</h3>
          
          <ToggleRow
            icon={Bell}
            label="Push Notifications"
            description="Receive alerts on your device"
            enabled={settings.pushEnabled}
            onToggle={() => toggleSetting('pushEnabled')}
          />
          <ToggleRow
            icon={Mail}
            label="Email Notifications"
            description="Updates sent to your email"
            enabled={settings.emailEnabled}
            onToggle={() => toggleSetting('emailEnabled')}
          />
          <ToggleRow
            icon={MessageSquare}
            label="SMS Notifications"
            description="Text messages for urgent updates"
            enabled={settings.smsEnabled}
            onToggle={() => toggleSetting('smsEnabled')}
          />
        </motion.div>
        
        {/* Category Toggles */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-3"
        >
          <h3 className="text-sm font-medium text-gray-400 mb-3">Notification Types</h3>
          
          <ToggleRow
            icon={Truck}
            label="Service Updates"
            description="Status changes for your requests"
            enabled={settings.categories.serviceUpdates}
            onToggle={() => toggleCategory('serviceUpdates')}
          />
          <ToggleRow
            icon={Tag}
            label="Promotions & Offers"
            description="Discounts and special deals"
            enabled={settings.categories.promotions}
            onToggle={() => toggleCategory('promotions')}
          />
          <ToggleRow
            icon={Clock}
            label="Reminders"
            description="Service reminders and tips"
            enabled={settings.categories.reminders}
            onToggle={() => toggleCategory('reminders')}
          />
          <ToggleRow
            icon={Newspaper}
            label="News & Updates"
            description="Product news and features"
            enabled={settings.categories.news}
            onToggle={() => toggleCategory('news')}
          />
        </motion.div>
      </div>
    </SubScreen>
  )
}

// Menu Item Component
function MenuItem({ 
  item, 
  index, 
  onPress 
}: { 
  item: { id: string; icon: React.ElementType; label: string; count?: number }
  index: number
  onPress: () => void 
}) {
  const [isHovered, setIsHovered] = useState(false)
  
  return (
    <motion.button
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onClick={onPress}
      className="w-full bg-white/5 hover:bg-white/[0.08] rounded-2xl p-4 flex items-center gap-4 transition-colors border border-transparent hover:border-white/5"
    >
      <div className="w-11 h-11 rounded-xl bg-purple-500/20 flex items-center justify-center">
        <item.icon size={22} className="text-purple-400" />
      </div>
      
      <span className="flex-1 text-left font-medium text-white">{item.label}</span>
      
      {item.count !== undefined && (
        <span className="text-gray-400 text-sm">{item.count}</span>
      )}
      
      <motion.div
        animate={{ x: isHovered ? 4 : 0 }}
        transition={{ duration: 0.2 }}
      >
        <ChevronRight size={20} className="text-gray-500" />
      </motion.div>
    </motion.button>
  )
}

// Sign In Card - shown when not authenticated
function SignInCard({ onSignIn }: { onSignIn: (payload: { name: string; phone: string; email?: string }) => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const handleSubmit = async () => {
    if (!name.trim() || !phone.trim()) return
    setIsSubmitting(true)
    await new Promise(r => setTimeout(r, 800))
    onSignIn({ name: name.trim(), phone: phone.trim(), email: email.trim() || undefined })
    setIsSubmitting(false)
  }
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/5 rounded-3xl p-6 border border-white/10"
    >
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mx-auto mb-4">
          <User size={32} className="text-white" />
        </div>
        <h2 className="text-xl font-semibold text-white">Sign In</h2>
        <p className="text-gray-400 text-sm mt-1">Enter your details to continue</p>
      </div>
      
      <div className="space-y-4">
        <FormInput
          label="Name"
          placeholder="Your name"
          value={name}
          onChange={setName}
        />
        <FormInput
          label="Phone"
          placeholder="+1 (555) 123-4567"
          value={phone}
          onChange={setPhone}
          type="tel"
        />
        <FormInput
          label="Email (optional)"
          placeholder="email@example.com"
          value={email}
          onChange={setEmail}
          type="email"
        />
      </div>
      
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        disabled={!name.trim() || !phone.trim() || isSubmitting}
        onClick={handleSubmit}
        className="w-full mt-6 py-4 rounded-2xl font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 text-white flex items-center justify-center disabled:opacity-50"
      >
        {isSubmitting ? <Loader2 size={20} className="animate-spin" /> : 'Continue'}
      </motion.button>
    </motion.div>
  )
}

// Persisted Vehicle Form Modal
function PersistedVehicleFormModal({ 
  vehicle, 
  onClose, 
  onSave 
}: { 
  vehicle: UserVehicle | null
  onClose: () => void
  onSave: (data: { make: string; model: string; year: number; color: string; plate: string }) => void 
}) {
  const [formData, setFormData] = useState({
    make: vehicle?.make || '',
    model: vehicle?.model || '',
    year: vehicle?.year || new Date().getFullYear(),
    color: vehicle?.color || 'White',
    plate: vehicle?.plate || '',
  })
  const [isSaving, setIsSaving] = useState(false)

  const colors = ['White', 'Black', 'Silver', 'Red', 'Blue', 'Green', 'Gray']

  const handleSave = async () => {
    setIsSaving(true)
    await new Promise(r => setTimeout(r, 800))
    onSave(formData)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end"
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="w-full bg-[#12122a] rounded-t-3xl max-h-[90vh] overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <h3 className="text-lg font-semibold text-white">
            {vehicle ? 'Edit Vehicle' : 'Add Vehicle'}
          </h3>
          <motion.button
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white"
          >
            <X size={18} />
          </motion.button>
        </div>
        
        <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Make"
              placeholder="Toyota"
              value={formData.make}
              onChange={(v) => setFormData({...formData, make: v})}
            />
            <FormInput
              label="Model"
              placeholder="Camry"
              value={formData.model}
              onChange={(v) => setFormData({...formData, model: v})}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Year"
              type="number"
              value={formData.year}
              onChange={(v) => {
                const year = parseInt(v) || new Date().getFullYear()
                setFormData({...formData, year: Math.max(1900, Math.min(2100, year))})
              }}
            />
            <FormInput
              label="License Plate"
              placeholder="ABC-1234"
              value={formData.plate}
              onChange={(v) => setFormData({...formData, plate: v.toUpperCase()})}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-3">Color</label>
            <div className="flex gap-2 flex-wrap">
              {colors.map((color) => (
                <motion.button
                  key={color}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setFormData({...formData, color})}
                  className={`w-10 h-10 rounded-full border-2 ${
                    formData.color === color ? 'border-emerald-500' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: getVehicleColor(color) }}
                />
              ))}
            </div>
          </div>
        </div>
        
        <div className="p-4 border-t border-white/5">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSave}
            disabled={isSaving || !formData.make || !formData.model}
            className="w-full py-4 rounded-2xl font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 text-white flex items-center justify-center disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={20} className="animate-spin" /> : 'Save Vehicle'}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// Persisted Vehicle Card
function PersistedVehicleCard({ 
  vehicle, 
  isActive,
  onEdit, 
  onSetActive, 
  onDelete 
}: { 
  vehicle: UserVehicle
  isActive: boolean
  onEdit: () => void
  onSetActive: () => void
  onDelete: () => void 
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      className="bg-white/5 rounded-2xl p-4 border border-white/5"
    >
      <div className="flex items-start gap-4">
        <div 
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: getVehicleColor(vehicle.color) }}
        >
          <Car size={24} className="text-white" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white truncate">
              {vehicle.year} {vehicle.make} {vehicle.model}
            </h3>
            {isActive && (
              <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                Active
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400">{vehicle.color}</p>
          <p className="text-xs text-gray-500 mt-1">{vehicle.plate}</p>
        </div>
        
        <DropdownMenu
          items={[
            { label: 'Edit', icon: Edit2, onPress: onEdit },
            ...(!isActive ? [{ label: 'Set as Active', icon: Star, onPress: onSetActive }] : []),
            { label: 'Delete', icon: Trash2, onPress: onDelete, destructive: true },
          ]}
        />
      </div>
    </motion.div>
  )
}

// Persisted Vehicles Screen - uses Zustand
function PersistedVehiclesScreen({ onBack }: { onBack: () => void }) {
  const { vehicles, activeVehicleId, addVehicle, updateVehicle, removeVehicle, setActiveVehicle } = useAppStore()
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState<UserVehicle | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  const handleSave = (data: { make: string; model: string; year: number; color: string; plate: string }) => {
    if (editingVehicle) {
      updateVehicle(editingVehicle.id, data)
    } else {
      addVehicle(data)
    }
    setShowAddModal(false)
    setEditingVehicle(null)
  }

  const handleDelete = (id: string) => {
    removeVehicle(id)
    setShowDeleteConfirm(null)
  }

  return (
    <SubScreen
      title="My Vehicles"
      onBack={onBack}
      actionButton={
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowAddModal(true)}
          className="w-full py-4 rounded-2xl font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 text-white flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          Add Vehicle
        </motion.button>
      }
    >
      <div className="p-6 space-y-3">
        <AnimatePresence>
          {vehicles.map((vehicle, index) => (
            <motion.div
              key={vehicle.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20, height: 0 }}
              transition={{ delay: index * 0.05 }}
              layout
            >
              <PersistedVehicleCard
                vehicle={vehicle}
                isActive={vehicle.id === activeVehicleId}
                onEdit={() => setEditingVehicle(vehicle)}
                onSetActive={() => setActiveVehicle(vehicle.id)}
                onDelete={() => setShowDeleteConfirm(vehicle.id)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
        
        {vehicles.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <Car size={48} className="mx-auto text-gray-600 mb-4" />
            <p className="text-gray-400">No vehicles added yet</p>
            <p className="text-gray-500 text-sm mt-1">Add a vehicle to use with your bookings</p>
          </motion.div>
        )}
      </div>
      
      <AnimatePresence>
        {(showAddModal || editingVehicle) && (
          <PersistedVehicleFormModal
            vehicle={editingVehicle}
            onClose={() => { setShowAddModal(false); setEditingVehicle(null); }}
            onSave={handleSave}
          />
        )}
      </AnimatePresence>
      
      <AnimatePresence>
        {showDeleteConfirm && (
          <DeleteConfirmModal
            title="Delete Vehicle?"
            message="This action cannot be undone."
            onConfirm={() => handleDelete(showDeleteConfirm)}
            onCancel={() => setShowDeleteConfirm(null)}
          />
        )}
      </AnimatePresence>
    </SubScreen>
  )
}

// Edit Profile Screen using Zustand
function EditPersistedProfileScreen({ onBack }: { onBack: () => void }) {
  const { user, updateUserProfile } = useAppStore()
  const [formData, setFormData] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    email: user?.email || '',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  const handleChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value })
    setHasChanges(true)
  }

  const handleSave = async () => {
    setIsSaving(true)
    await new Promise(r => setTimeout(r, 1000))
    updateUserProfile({
      name: formData.name,
      phone: formData.phone,
      email: formData.email || undefined,
    })
    setIsSaving(false)
    onBack()
  }

  if (!user) return null

  return (
    <SubScreen
      title="Edit Profile"
      onBack={onBack}
      actionButton={
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          disabled={!hasChanges || isSaving}
          onClick={handleSave}
          className={`w-full py-4 rounded-2xl font-semibold flex items-center justify-center ${
            hasChanges
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white'
              : 'bg-white/10 text-gray-500'
          }`}
        >
          {isSaving ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            'Save Changes'
          )}
        </motion.button>
      }
    >
      <div className="p-6 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center"
        >
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-2xl font-bold text-white">
              {formData.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U'}
            </div>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="absolute bottom-0 right-0 w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white"
            >
              <Camera size={16} />
            </motion.button>
          </div>
        </motion.div>
        
        <div className="space-y-4">
          <FormInput
            label="Name"
            value={formData.name}
            onChange={(v) => handleChange('name', v)}
          />
          <FormInput
            label="Phone"
            type="tel"
            value={formData.phone}
            onChange={(v) => handleChange('phone', v)}
          />
          <FormInput
            label="Email (optional)"
            type="email"
            value={formData.email}
            onChange={(v) => handleChange('email', v)}
          />
        </div>
      </div>
    </SubScreen>
  )
}

// Main Profile Screen
export default function ProfileScreen() {
  const { 
    isAuthed, 
    user, 
    signInMock, 
    signOut, 
    vehicles, 
    bookingHistory 
  } = useAppStore()
  
  const [activeSection, setActiveSection] = useState<string | null>(null)
  // Legacy local state for non-persisted features
  const [addresses, setAddresses] = useState(initialAddresses)
  const [payments, setPayments] = useState(initialPayments)
  const [notifications, setNotifications] = useState(initialNotifications)

  const menuItems = [
    { id: 'editProfile', icon: UserCog, label: 'Edit Profile' },
    { id: 'vehicles', icon: Car, label: 'My Vehicles', count: vehicles.length },
    { id: 'addresses', icon: MapPin, label: 'Saved Addresses', count: addresses.length },
    { id: 'payments', icon: CreditCard, label: 'Payment Methods' },
    { id: 'notifications', icon: Bell, label: 'Notifications' },
    { id: 'privacy', icon: Shield, label: 'Privacy & Security' },
    { id: 'help', icon: HelpCircle, label: 'Help & Support' },
  ]

  // Not authenticated - show sign in
  if (!isAuthed || !user) {
    return (
      <div className="max-w-md mx-auto px-5 py-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h1 className="text-xl font-semibold text-white mb-1">Profile</h1>
          <p className="text-white/40 text-sm">Sign in to manage your account</p>
        </motion.div>
        
        <SignInCard onSignIn={signInMock} />
        
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-white/20 text-xs mt-6"
        >
          AID v1.0.0
        </motion.p>
      </div>
    )
  }

  // Get user initials
  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="max-w-md mx-auto px-5 py-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-xl font-semibold text-white mb-1">Profile</h1>
        <p className="text-white/40 text-sm">Manage your account settings</p>
      </motion.div>
      
      {/* User Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 bg-white/5 rounded-3xl p-5 flex items-center gap-4 border border-white/5"
      >
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-xl font-bold text-white">
          {initials}
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-white">{user.name}</h2>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Phone size={14} />
            <span>{user.phone}</span>
          </div>
          {user.email && (
            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
              <Mail size={12} />
              <span>{user.email}</span>
            </div>
          )}
        </div>
      </motion.div>
      
      {/* Stats Row */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-6 grid grid-cols-3 gap-3"
      >
        <div className="bg-white/5 rounded-2xl p-4 text-center border border-white/5">
          <p className="text-2xl font-bold text-emerald-400">{bookingHistory.length}</p>
          <p className="text-xs text-gray-400 mt-1">Services</p>
        </div>
        <div className="bg-white/5 rounded-2xl p-4 text-center border border-white/5">
          <p className="text-2xl font-bold text-emerald-400">4.9</p>
          <p className="text-xs text-gray-400 mt-1">Rating</p>
        </div>
        <div className="bg-white/5 rounded-2xl p-4 text-center border border-white/5">
          <p className="text-2xl font-bold text-emerald-400">{vehicles.length}</p>
          <p className="text-xs text-gray-400 mt-1">Vehicles</p>
        </div>
      </motion.div>
      
      {/* Menu Items */}
      <div className="space-y-2">
        {menuItems.map((item, index) => (
          <MenuItem
            key={item.id}
            item={item}
            index={index}
            onPress={() => setActiveSection(item.id)}
          />
        ))}
      </div>
      
      {/* Logout Button */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-6"
      >
        <motion.button
          whileHover={{ scale: 1.01, backgroundColor: 'rgba(239,68,68,0.15)' }}
          whileTap={{ scale: 0.98 }}
          onClick={signOut}
          className="w-full bg-red-500/10 text-red-400 font-medium py-4 rounded-2xl flex items-center justify-center gap-2 border border-red-500/20"
        >
          <LogOut size={20} />
          Sign Out
        </motion.button>
      </motion.div>
      
      {/* App Version */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-center text-white/20 text-xs mt-6"
      >
        AID v1.0.0
      </motion.p>
      
      {/* Sub-screens */}
      <AnimatePresence>
        {activeSection === 'editProfile' && (
          <EditPersistedProfileScreen 
            onBack={() => setActiveSection(null)} 
          />
        )}
        {activeSection === 'vehicles' && (
          <PersistedVehiclesScreen 
            onBack={() => setActiveSection(null)} 
          />
        )}
        {activeSection === 'addresses' && (
          <AddressesScreen 
            addresses={addresses} 
            onBack={() => setActiveSection(null)} 
            onUpdate={setAddresses}
          />
        )}
        {activeSection === 'payments' && (
          <PaymentsScreen 
            payments={payments} 
            onBack={() => setActiveSection(null)} 
            onUpdate={setPayments}
          />
        )}
        {activeSection === 'notifications' && (
          <NotificationsScreen 
            settings={notifications} 
            onBack={() => setActiveSection(null)} 
            onUpdate={setNotifications}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
