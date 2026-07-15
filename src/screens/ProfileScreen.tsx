import { useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  Car,
  Check,
  ChevronRight,
  HelpCircle,
  LogOut,
  Mail,
  MapPin,
  Phone,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { useAuthStore } from '../store/useAuthStore'

const emptyVehicle = { make: '', model: '', year: '', color: '', plate: '' }

export default function ProfileScreen() {
  const {
    user: profile,
    vehicles,
    activeVehicleId,
    addVehicle,
    removeVehicle,
    setActiveVehicle,
    setActiveModal,
    signOut,
  } = useAppStore()
  const { user: authUser, isAuthenticated, logout } = useAuthStore()
  const [showVehicleForm, setShowVehicleForm] = useState(false)
  const [vehicleForm, setVehicleForm] = useState(emptyVehicle)

  const name = profile?.name || (authUser ? `${authUser.firstName} ${authUser.lastName}`.trim() : '')
  const email = profile?.email || authUser?.email
  const phone = profile?.phone || authUser?.phone

  const submitVehicle = (event: FormEvent) => {
    event.preventDefault()
    const year = Number(vehicleForm.year)
    if (!vehicleForm.make.trim() || !vehicleForm.model.trim() || !year) return
    addVehicle({
      make: vehicleForm.make.trim(),
      model: vehicleForm.model.trim(),
      year,
      color: vehicleForm.color.trim() || 'Not specified',
      plate: vehicleForm.plate.trim() || 'Not added',
    })
    setVehicleForm(emptyVehicle)
    setShowVehicleForm(false)
  }

  const handleLogout = () => {
    logout()
    signOut()
  }

  return (
    <div className="account-screen">
      <header className="account-header"><p>Profile and preferences</p><h1>Account</h1></header>

      <section className="account-identity" aria-label="Account profile">
        <span>{name ? name.charAt(0).toUpperCase() : <UserRound size={25} />}</span>
        <div><strong>{name || 'Guest account'}</strong><small>{email || phone || 'Your roadside settings are saved on this device'}</small></div>
        <ShieldCheck size={19} />
      </section>

      <section className="account-section" aria-labelledby="account-garage-title">
        <div className="account-section__heading"><div><p>VEHICLES</p><h2 id="account-garage-title">Your garage</h2></div><button type="button" onClick={() => setShowVehicleForm(true)}><Plus size={16} /> Add vehicle</button></div>
        {vehicles.length > 0 ? (
          <div className="account-vehicles">
            {vehicles.map((vehicle) => {
              const active = vehicle.id === activeVehicleId || (!activeVehicleId && vehicle.id === vehicles[0].id)
              return (
                <div className={`account-vehicle ${active ? 'is-active' : ''}`} key={vehicle.id}>
                  <button type="button" className="account-vehicle__select" onClick={() => setActiveVehicle(vehicle.id)} aria-label={`Use ${vehicle.year} ${vehicle.make} ${vehicle.model} for requests`}>
                    <span><Car size={21} /></span>
                    <div><strong>{vehicle.year} {vehicle.make} {vehicle.model}</strong><small>{vehicle.color} · {vehicle.plate}</small></div>
                    {active ? <span className="account-vehicle__active"><Check size={14} /> ACTIVE</span> : <ChevronRight size={18} />}
                  </button>
                  <button type="button" className="account-vehicle__remove" aria-label={`Remove ${vehicle.make} ${vehicle.model}`} onClick={() => removeVehicle(vehicle.id)}><Trash2 size={16} /></button>
                </div>
              )
            })}
          </div>
        ) : (
          <button type="button" className="account-empty-vehicle" onClick={() => setShowVehicleForm(true)}>
            <span><Car size={24} /></span><div><strong>Add your first vehicle</strong><p>Skip make, model, and year entry during an emergency.</p></div><ChevronRight size={18} />
          </button>
        )}
      </section>

      <section className="account-section" aria-labelledby="support-title">
        <div className="account-section__heading"><div><p>HELP & SAFETY</p><h2 id="support-title">Support</h2></div></div>
        <div className="account-menu">
          <button type="button" onClick={() => setActiveModal('emergency_sos')}><span className="account-menu__icon"><HelpCircle size={20} /></span><span><strong>Roadside support</strong><small>Get help with an active or new request</small></span><ChevronRight size={18} /></button>
          <button type="button" onClick={() => setActiveModal('locationConfirm')}><span className="account-menu__icon"><MapPin size={20} /></span><span><strong>Location preferences</strong><small>Confirm where assistance should arrive</small></span><ChevronRight size={18} /></button>
          <a href="tel:911"><span className="account-menu__icon account-menu__icon--danger"><AlertTriangle size={20} /></span><span><strong>Emergency services</strong><small>Call 911 if you are in immediate danger</small></span><ChevronRight size={18} /></a>
        </div>
      </section>

      {(email || phone) && (
        <section className="account-section" aria-labelledby="details-title">
          <div className="account-section__heading"><div><p>CONTACT</p><h2 id="details-title">Account details</h2></div></div>
          <div className="account-contact">
            {email && <div><Mail size={18} /><span><small>Email</small><strong>{email}</strong></span></div>}
            {phone && <div><Phone size={18} /><span><small>Phone</small><strong>{phone}</strong></span></div>}
          </div>
        </section>
      )}

      {isAuthenticated && <button type="button" className="account-signout" onClick={handleLogout}><LogOut size={17} /> Sign out</button>}
      <p className="account-version">AID Roadside · Version 1.0</p>

      {showVehicleForm && createPortal(
        <div className="account-sheet-backdrop" role="presentation" onMouseDown={() => setShowVehicleForm(false)}>
          <form className="account-sheet" aria-label="Add vehicle form" onSubmit={submitVehicle} onMouseDown={(event) => event.stopPropagation()}>
            <div className="account-sheet__handle" />
            <div className="account-sheet__header"><div><small>YOUR GARAGE</small><h2>Add a vehicle</h2></div><button type="button" aria-label="Close vehicle form" onClick={() => setShowVehicleForm(false)}><X size={20} /></button></div>
            <div className="account-sheet__grid">
              <label><span>Make</span><input required value={vehicleForm.make} onChange={(event) => setVehicleForm({ ...vehicleForm, make: event.target.value })} placeholder="Toyota" /></label>
              <label><span>Model</span><input required value={vehicleForm.model} onChange={(event) => setVehicleForm({ ...vehicleForm, model: event.target.value })} placeholder="Camry" /></label>
              <label><span>Year</span><input required inputMode="numeric" value={vehicleForm.year} onChange={(event) => setVehicleForm({ ...vehicleForm, year: event.target.value })} placeholder="2024" /></label>
              <label><span>Color</span><input value={vehicleForm.color} onChange={(event) => setVehicleForm({ ...vehicleForm, color: event.target.value })} placeholder="Black" /></label>
              <label className="account-sheet__wide"><span>License plate</span><input value={vehicleForm.plate} onChange={(event) => setVehicleForm({ ...vehicleForm, plate: event.target.value })} placeholder="ABC-1234" /></label>
            </div>
            <button type="submit" className="account-sheet__submit">Save vehicle</button>
          </form>
        </div>,
        document.body,
      )}
    </div>
  )
}
