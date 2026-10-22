import {
  ArrowRight,
  Battery,
  Bell,
  Car,
  ChevronRight,
  CircleDot,
  Clock3,
  Fuel,
  KeyRound,
  MapPin,
  MessageCircle,
  Navigation,
  Plus,
  ShieldCheck,
  Sparkles,
  Sun,
  Truck,
  UserRound,
  Wrench,
  Zap,
} from 'lucide-react'
import { useState } from 'react'
import AidBrand from '../components/brand/AidBrand'
import { useAppStore } from '../store/useAppStore'
import type { ServiceType } from '../types'
import { driverTracking } from '../lib/customerTracking'
import { customerStatusLine } from '../lib/jobLifecycle'
import { HistoryModal } from '../components/modals'
import RequestSheet from '../components/request/RequestSheet'
import { SafetySheet } from '../components/safety/Safety'

const services: Array<{ label: string; icon: typeof Battery; service: ServiceType }> = [
  { label: "Won't start", icon: Battery, service: 'battery_jump' },
  { label: 'Flat tire', icon: CircleDot, service: 'flat_tire' },
  { label: 'Tow', icon: Truck, service: 'towing' },
  { label: 'Locked out', icon: KeyRound, service: 'lockout' },
  { label: 'Fuel', icon: Fuel, service: 'fuel_delivery' },
  { label: 'EV charge', icon: Zap, service: 'ev_charging' },
]


export default function HomeScreen() {
  const {
    activeBooking,
    bookingHistory,
    vehicles,
    activeVehicleId,
    user,
    userLocationLabel,
    unreadCount,
    setCurrentScreen,
    setActiveModal,
    setServiceFormData,
    resetServiceFormData,
    rebookFromHistory,
  } = useAppStore()
  const [showSafety, setShowSafety] = useState(false)

  // Real jobs: the server's approximate ETA (hidden when the driver's location is too old).
  const activeEta = activeBooking
    ? activeBooking.driver
      ? driverTracking(activeBooking, Date.now()).eta?.minutes ?? null
      : activeBooking.providerETA ?? activeBooking.estimatedArrival ?? null
    : null

  const activeVehicle = vehicles.find((vehicle) => vehicle.id === activeVehicleId) ?? vehicles[0]
  const recentBooking = bookingHistory.find((booking) => booking.status === 'completed')

  // Every on-demand service uses the same request sheet.
  const startService = (service: ServiceType | null) => {
    resetServiceFormData()
    setServiceFormData({ selectedService: service })
    setActiveModal('services')
  }

  return (
    <div className="consumer-home">
      <header className="consumer-topbar">
        <AidBrand compact label="ROADSIDE" />
        <div className="consumer-topbar__actions">
          <button type="button" className="consumer-icon-button" aria-label="Activity and notifications" onClick={() => setCurrentScreen('history')}>
            <Bell size={20} />
            {unreadCount > 0 && <span>{Math.min(unreadCount, 9)}</span>}
          </button>
          <button type="button" className="consumer-avatar" aria-label="Open account" onClick={() => setCurrentScreen('profile')}>
            {user?.name ? user.name.charAt(0).toUpperCase() : <UserRound size={20} />}
          </button>
        </div>
      </header>

      <button type="button" className="consumer-location" onClick={() => setActiveModal('locationConfirm')} aria-label={userLocationLabel || 'Confirm your location'}>
        <span className="consumer-location__pin"><MapPin size={20} /></span>
        <span><small>YOUR LOCATION</small><strong>{userLocationLabel || 'Confirm your location'}</strong></span>
        <ChevronRight size={19} />
      </button>

      {activeBooking && (
        <button type="button" className="consumer-active" onClick={() => setCurrentScreen('chat')} aria-label="Track active request">
          <div className="consumer-active__status"><span><i /> ACTIVE REQUEST</span><strong>{activeEta != null ? `≈ ${activeEta} min` : '-- min'}</strong></div>
          <div className="consumer-active__main">
            <span className="consumer-active__nav"><Navigation size={22} /></span>
            <div><strong>{customerStatusLine(activeBooking)}</strong><p>{activeBooking.service.name} · {activeBooking.location.address}</p></div>
            <ChevronRight size={20} />
          </div>
          <div className="consumer-active__footer"><span><MessageCircle size={15} /> Message</span><span>Track provider <ArrowRight size={15} /></span></div>
        </button>
      )}

      <main>
        <section className="consumer-intro" aria-labelledby="consumer-help-title">
          <p>{user?.name ? 'Hi, ' + user.name.split(' ')[0] : 'Roadside assistance'}</p>
          <h1 id="consumer-help-title">How can we help?</h1>
          <span><i /> Providers available nearby</span>
        </section>

        <section className="service-launcher" aria-label="Roadside services">
          <div className="service-shortcuts">
            {services.map(({ label, icon: Icon, service }) => (
              <button key={service} type="button" aria-label={label === 'Tow' ? 'Need a tow' : label} onClick={() => startService(service)}>
                <span><Icon size={23} strokeWidth={1.8} /></span>
                <strong>{label}</strong>
              </button>
            ))}
          </div>
          <button type="button" className="guided-help" onClick={() => startService(null)}>
            <span className="guided-help__icon"><Wrench size={20} /></span>
            <span><strong>Not sure what you need?</strong><small>Tell us what happened</small></span>
            <ArrowRight size={19} />
          </button>
        </section>

        <section className="consumer-section" aria-labelledby="garage-title">
          <div className="consumer-section__heading"><h2 id="garage-title">Your garage</h2><button type="button" onClick={() => setCurrentScreen('profile')}>{activeVehicle ? 'Manage' : 'Add'}</button></div>
          {activeVehicle ? (
            <button type="button" className="garage-card" onClick={() => setCurrentScreen('profile')}>
              <span className="garage-card__vehicle"><Car size={23} /></span>
              <span><strong>{activeVehicle.year} {activeVehicle.make} {activeVehicle.model}</strong><small>{activeVehicle.color} · {activeVehicle.plate}</small></span>
              <span className="garage-card__ready"><ShieldCheck size={16} /> READY</span>
              <ChevronRight size={18} />
            </button>
          ) : (
            <button type="button" className="garage-empty" onClick={() => setCurrentScreen('profile')}>
              <span><Plus size={22} /></span>
              <div><strong>Add a vehicle to request faster</strong><p>We’ll use it automatically when you need help.</p></div>
              <ChevronRight size={18} />
            </button>
          )}
        </section>

        {recentBooking && (
          <section className="consumer-section" aria-labelledby="recent-title">
            <div className="consumer-section__heading"><h2 id="recent-title">Use again</h2><button type="button" onClick={() => setCurrentScreen('history')}>See activity</button></div>
            <button type="button" className="repeat-service" onClick={() => rebookFromHistory(recentBooking.id)}>
              <span><Clock3 size={20} /></span>
              <div><strong>{recentBooking.service.name}</strong><small>{recentBooking.location.address}</small></div>
              <span>Request again <ArrowRight size={15} /></span>
            </button>
          </section>
        )}

        <section className="consumer-section" aria-labelledby="care-title">
          <div className="consumer-section__heading"><h2 id="care-title">Vehicle care</h2></div>
          <div className="care-row">
            <button type="button" onClick={() => startService('oil_change')}><span><Car size={20} /></span><strong>Oil change</strong><small>At your location</small></button>
            <button type="button" className="is-soon" disabled aria-label="Detailing, coming soon"><span><Sparkles size={20} /></span><strong>Detailing</strong><small>Coming soon</small></button>
            <button type="button" className="is-soon" disabled aria-label="Window tint, coming soon"><span><Sun size={20} /></span><strong>Window tint</strong><small>Coming soon</small></button>
          </div>
        </section>

        <button type="button" className="consumer-safety" aria-haspopup="dialog" onClick={() => setShowSafety(true)}><ShieldCheck size={18} aria-hidden="true" /><span><strong>Safety</strong><small>AID is not an emergency service. If you’re in danger, call 911.</small></span></button>
        {showSafety && <SafetySheet audience="customer" onClose={() => setShowSafety(false)} />}
      </main>

      <RequestSheet />
      <HistoryModal />
    </div>
  )
}
