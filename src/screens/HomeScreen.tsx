/**
 * Customer Home (owner reference, flat — no glow): AID logo + profile, one headline with true trust
 * chips, a small abstract illustration (own SVG, no stock photo), and six service tiles. A live
 * request takes over the top: following it is the one thing to do. Garage has its own tab.
 */

import {
  ArrowRight,
  Battery,
  ChevronRight,
  CircleDot,
  Fuel,
  KeyRound,
  MapPinned,
  Navigation,
  RotateCcw,
  ShieldCheck,
  Truck,
  UserRound,
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
import SectionHeader from '../components/ui/SectionHeader'
import { List, ListRow } from '../components/ui/ListRow'

/** Six tiles, 3×2 (reference order). Subtitles describe the service; prices come later from the server. */
const services: Array<{ label: string; detail: string; icon: typeof Battery; service: ServiceType }> = [
  { label: 'Flat tire', detail: 'Spare or inflate', icon: CircleDot, service: 'flat_tire' },
  { label: 'Jump start', detail: 'Dead battery', icon: Battery, service: 'battery_jump' },
  { label: 'Tow', detail: 'Shop or home', icon: Truck, service: 'towing' },
  { label: 'Locked out', detail: 'Keys inside', icon: KeyRound, service: 'lockout' },
  { label: 'Fuel delivery', detail: 'Out of gas', icon: Fuel, service: 'fuel_delivery' },
  { label: 'EV charge', detail: 'Mobile charge', icon: Zap, service: 'ev_charging' },
]

/** Flat abstract road + pin (own artwork). Decorative only. */
function HomeHero() {
  return (
    <div className="home-hero" aria-hidden="true">
      <svg viewBox="0 0 350 112" preserveAspectRatio="xMidYMid slice" focusable="false">
        {/* Filled shapes only (no strokes) — flat, muted, one violet accent. */}
        <rect width="350" height="112" fill="#141417" />
        <path d="M0 84 C80 74 110 64 150 40 L156 46 C118 72 84 84 0 94 Z" fill="#26262b" />
        <path d="M350 92 C278 82 240 70 206 44 L200 50 C232 78 272 92 350 102 Z" fill="#26262b" />
        <path d="M112 112 L166 0 H184 L238 112 Z" fill="#232327" />
        <rect x="174" y="6" width="2" height="16" rx="1" fill="#5a5a62" />
        <rect x="174" y="34" width="2" height="18" rx="1" fill="#5a5a62" />
        <rect x="174" y="66" width="2" height="22" rx="1" fill="#5a5a62" />
        <rect x="174" y="100" width="2" height="12" rx="1" fill="#5a5a62" />
        <rect x="234.5" y="50" width="3" height="16" rx="1.5" fill="#ededef" />
        <circle cx="236" cy="40" r="17" fill="#ededef" />
        <circle cx="236" cy="40" r="14" fill="#6e56cf" />
        <circle cx="236" cy="40" r="4.5" fill="#ededef" />
      </svg>
    </div>
  )
}

export default function HomeScreen() {
  const {
    activeBooking,
    activeModal,
    bookingHistory,
    serviceFormData,
    setCurrentScreen,
    setActiveModal,
    setServiceFormData,
    resetServiceFormData,
    rebookFromHistory,
  } = useAppStore()
  const [showSafety, setShowSafety] = useState(false)

  // The server's approximate ETA once a driver is sharing location (hidden when it is too old).
  const activeEta = activeBooking?.driver ? driverTracking(activeBooking, Date.now()).eta?.minutes ?? null : null
  const recentBooking = bookingHistory.find((booking) => booking.status === 'completed')
  const choosing = activeModal === 'services' ? serviceFormData.selectedService : null

  // Every on-demand service uses the same request flow.
  const startService = (service: ServiceType | null) => {
    resetServiceFormData()
    setServiceFormData({ selectedService: service })
    setActiveModal('services')
  }

  return (
    <div className="consumer-home">
      <header className="consumer-topbar">
        <AidBrand compact />
        <button type="button" className="consumer-profile" aria-label="Open account" onClick={() => setCurrentScreen('profile')}>
          <UserRound size={20} aria-hidden="true" />
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
          <section className="home-intro" aria-labelledby="home-title">
            <h1 id="home-title">Roadside help when you need it.</h1>
            <p>Verified drivers come to you. You see the price before you request.</p>
            {/* Only claims that are true today. "24/7" waits for operating hours (launch checklist A8). */}
            <ul className="home-chips" aria-label="Why AID">
              <li><ShieldCheck size={14} aria-hidden="true" /> Verified drivers</li>
              <li><MapPinned size={14} aria-hidden="true" /> Live tracking</li>
            </ul>
          </section>

          <HomeHero />

          <div className="home-tiles" role="group" aria-label="Roadside services">
            {services.map(({ label, detail, icon: Icon, service }) => (
              <button key={service} type="button" className={choosing === service ? 'is-selected' : ''} onClick={() => startService(service)}>
                <span className="home-tiles__icon" aria-hidden="true"><Icon size={24} /></span>
                <strong>{label}</strong>
                <small>{detail}</small>
              </button>
            ))}
          </div>

          <button type="button" className="home-unsure" onClick={() => startService(null)}>
            <span>Not sure what you need?</span> <strong>Tell us what happened</strong>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </>
      )}

      {/* The app shell provides the page's one <main>. */}
      {recentBooking && !activeBooking && (
        <section className="ui-section" aria-labelledby="recent-title">
          <SectionHeader id="recent-title" title="Use again" action={{ label: 'See activity', onClick: () => setCurrentScreen('history') }} />
          <List>
            <ListRow icon={<RotateCcw size={19} />} title={recentBooking.service.name} subtitle={recentBooking.location.address}
              trailing={<span className="ui-row__value consumer-again">Request again</span>} onClick={() => rebookFromHistory(recentBooking.id)} />
          </List>
        </section>
      )}

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
