import {
  ArrowRight,
  Battery,
  Car,
  ChevronRight,
  CircleDot,
  Droplets,
  Fuel,
  KeyRound,
  MapPin,
  Navigation,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Sun,
  Truck,
  Wrench,
  Zap,
} from 'lucide-react'
import { useState } from 'react'
import AidBrand from '../components/brand/AidBrand'
import { useAppStore } from '../store/useAppStore'
import type { ServiceType } from '../types'
import { driverTracking } from '../lib/customerTracking'
import { customerStatusLine } from '../lib/jobLifecycle'
import RequestSheet from '../components/request/RequestSheet'
import { SafetySheet } from '../components/safety/Safety'
import PersonAvatar from '../components/ui/PersonAvatar'
import SectionHeader from '../components/ui/SectionHeader'
import { List, ListRow } from '../components/ui/ListRow'

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
    setCurrentScreen,
    setActiveModal,
    setServiceFormData,
    resetServiceFormData,
    rebookFromHistory,
  } = useAppStore()
  const [showSafety, setShowSafety] = useState(false)

  // The server's approximate ETA once a driver is sharing location (hidden when it is too old).
  const activeEta = activeBooking?.driver ? driverTracking(activeBooking, Date.now()).eta?.minutes ?? null : null

  const activeVehicle = vehicles.find((vehicle) => vehicle.id === activeVehicleId) ?? vehicles[0]
  const recentBooking = bookingHistory.find((booking) => booking.status === 'completed')
  const firstName = user?.name ? user.name.split(' ')[0] : ''

  // Every on-demand service uses the same request sheet.
  const startService = (service: ServiceType | null) => {
    resetServiceFormData()
    setServiceFormData({ selectedService: service })
    setActiveModal('services')
  }

  return (
    <div className="consumer-home">
      <header className="consumer-topbar">
        <AidBrand compact />
        <button type="button" className="consumer-avatar" aria-label="Open account" onClick={() => setCurrentScreen('profile')}>
          <PersonAvatar name={user?.name} size="sm" />
        </button>
      </header>

      {activeBooking ? (
        /* A live request supersedes the normal Home: one dominant thing to do — follow it. */
        <>
        <h1 className="sr-only">Your request</h1>
        <button type="button" className="consumer-live" onClick={() => setCurrentScreen('chat')}>
          <span className="sr-only">Track active request: </span>
          <span className="consumer-live__top">
            <span className="consumer-live__status"><i className="ui-dot ui-dot--live" aria-hidden="true" /> {activeBooking.driver ? 'Driver on the way' : 'Request sent'}</span>
            <span className="consumer-live__eta">{activeEta != null ? `${activeEta} min` : activeBooking.driver ? 'Live' : 'Finding a driver'}</span>
          </span>
          <strong className="consumer-live__title">{customerStatusLine(activeBooking)}</strong>
          <span className="consumer-live__meta">{activeBooking.service.name} · {activeBooking.location.address}</span>
          <span className="consumer-live__cta"><Navigation size={18} aria-hidden="true" /> {activeBooking.driver ? 'Track your driver' : 'View your request'} <ArrowRight size={18} aria-hidden="true" /></span>
        </button>
        </>
      ) : (
        <>
          <button type="button" className="consumer-location" onClick={() => setActiveModal('locationConfirm')}>
            <span className="consumer-location__pin" aria-hidden="true"><MapPin size={19} /></span>
            <span className="consumer-location__text"><small>Your location</small><strong>{userLocationLabel || 'Confirm your location'}</strong></span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>

          <section className="consumer-intro" aria-labelledby="consumer-help-title">
            {firstName && <p>Hi {firstName}</p>}
            <h1 id="consumer-help-title">How can we help?</h1>
          </section>

          <section className="service-launcher" aria-label="Roadside services">
            <div className="service-shortcuts">
              {services.map(({ label, icon: Icon, service }) => (
                <button key={service} type="button" aria-label={label === 'Tow' ? 'Need a tow' : label} onClick={() => startService(service)}>
                  <span aria-hidden="true"><Icon size={22} /></span>
                  <strong>{label}</strong>
                </button>
              ))}
            </div>
            <button type="button" className="guided-help" onClick={() => startService(null)}>
              <span className="guided-help__icon" aria-hidden="true"><Wrench size={18} /></span>
              <span><strong>Not sure what you need?</strong><small>Tell us what happened</small></span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <p className="consumer-trust"><ShieldCheck size={14} aria-hidden="true" /> Every AID driver is verified</p>
          </section>
        </>
      )}

      {/* The app shell provides the page's one <main>. */}
      <section className="ui-section" aria-labelledby="garage-title">
        <SectionHeader id="garage-title" title="Your garage" action={{ label: activeVehicle ? 'Manage' : 'Add', onClick: () => setCurrentScreen('profile'), ariaLabel: activeVehicle ? 'Manage vehicles' : 'Add a vehicle' }} />
        <List>
          {activeVehicle ? (
            <ListRow icon={<Car size={20} />} title={`${activeVehicle.year} ${activeVehicle.make} ${activeVehicle.model}`} subtitle={`${activeVehicle.color} · ${activeVehicle.plate}`}
              trailing={<span className="ui-chip ui-chip--success">Ready</span>} onClick={() => setCurrentScreen('profile')} />
          ) : (
            <ListRow icon={<Plus size={20} />} title="Add a vehicle to request faster" subtitle="We’ll use it automatically when you need help." onClick={() => setCurrentScreen('profile')} />
          )}
        </List>
      </section>

      {recentBooking && !activeBooking && (
        <section className="ui-section" aria-labelledby="recent-title">
          <SectionHeader id="recent-title" title="Use again" action={{ label: 'See activity', onClick: () => setCurrentScreen('history') }} />
          <List>
            <ListRow icon={<RotateCcw size={19} />} title={recentBooking.service.name} subtitle={recentBooking.location.address}
              trailing={<span className="ui-row__value consumer-again">Request again</span>} onClick={() => rebookFromHistory(recentBooking.id)} />
          </List>
        </section>
      )}

      <section className="ui-section" aria-labelledby="care-title">
        <SectionHeader id="care-title" title="Vehicle care" />
        <div className="care-grid" role="group" aria-label="Vehicle care">
          <button type="button" onClick={() => startService('oil_change')} disabled={Boolean(activeBooking)}><span aria-hidden="true"><Droplets size={19} /></span><strong>Oil change</strong><small>Mobile</small></button>
          <button type="button" className="is-soon" disabled><span aria-hidden="true"><Sparkles size={19} /></span><strong>Detailing</strong> <small>Coming soon</small></button>
          <button type="button" className="is-soon" disabled><span aria-hidden="true"><Sun size={19} /></span><strong>Window tint</strong> <small>Coming soon</small></button>
        </div>
      </section>

      <button type="button" className="consumer-safety" aria-haspopup="dialog" onClick={() => setShowSafety(true)}>
        <ShieldCheck size={18} aria-hidden="true" />
        <span><strong>Safety</strong><small>AID is not an emergency service. If you’re in danger, call 911.</small></span>
        <ChevronRight size={16} aria-hidden="true" />
      </button>
      {showSafety && <SafetySheet audience="customer" onClose={() => setShowSafety(false)} />}

      <RequestSheet />
    </div>
  )
}
