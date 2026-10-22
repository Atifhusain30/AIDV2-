import { useEffect, useState, type FormEvent } from 'react'
import Dialog from '../components/ui/Dialog'
import {
  Car,
  Check,
  ChevronRight,
  LifeBuoy,
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
import { apiService } from '../services/api'
import { signOut } from '../auth/signOut'
import { SafetyMenuItem } from '../components/safety/Safety'
import HelpSupportScreen from './HelpSupportScreen'

const emptyVehicle = { make: '', model: '', year: '', color: '', plate: '' }

export default function ProfileScreen() {
  const {
    user: profile,
    vehicles,
    activeVehicleId,
    addVehicle,
    removeVehicle,
    setActiveVehicle,
    setVehicles,
    setActiveModal,
  } = useAppStore()
  const { user: authUser, isAuthenticated, token } = useAuthStore()
  const [showVehicleForm, setShowVehicleForm] = useState(false)
  const [vehicleForm, setVehicleForm] = useState(emptyVehicle)
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    if (!token) return
    void apiService.listVehicles().then((result) => {
      if (result.success && result.data) setVehicles(result.data)
    })
  }, [token, setVehicles])

  const name = profile?.name || (authUser ? `${authUser.firstName} ${authUser.lastName}`.trim() : '')
  const email = profile?.email || authUser?.email
  const phone = profile?.phone || authUser?.phone

  const submitVehicle = async (event: FormEvent) => {
    event.preventDefault()
    const year = Number(vehicleForm.year)
    if (!vehicleForm.make.trim() || !vehicleForm.model.trim() || !year) return
    const input = {
      make: vehicleForm.make.trim(),
      model: vehicleForm.model.trim(),
      year,
      color: vehicleForm.color.trim() || 'Not specified',
      plate: vehicleForm.plate.trim() || 'Not added',
    }
    if (token) {
      const result = await apiService.createVehicle(input)
      if (!result.success || !result.data) {
        window.alert(result.error || 'Unable to save vehicle.')
        return
      }
      setVehicles([result.data, ...vehicles])
    } else {
      addVehicle(input)
    }
    setVehicleForm(emptyVehicle)
    setShowVehicleForm(false)
  }

  const handleRemoveVehicle = async (vehicleId: string) => {
    if (token) {
      const result = await apiService.deleteVehicle(vehicleId)
      if (!result.success) {
        window.alert(result.error || 'Unable to remove vehicle.')
        return
      }
      setVehicles(vehicles.filter((vehicle) => vehicle.id !== vehicleId))
      return
    }
    removeVehicle(vehicleId)
  }

  // E6: the one full sign-out (src/auth/signOut.ts).
  const handleLogout = () => { void signOut('user') }

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true)
    setDeleteError(null)
    const result = await apiService.deleteAccount()
    setIsDeletingAccount(false)
    if (!result.success) {
      setDeleteError(result.error || 'Unable to delete your account. Please try again.')
      return
    }
    setShowDeleteConfirmation(false)
    // E6: the account is gone on the server; remove everything of it from this phone too.
    void signOut('deleted')
  }

  if (showHelp) return <HelpSupportScreen audience="customer" onBack={() => setShowHelp(false)} />

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
                  <button type="button" className="account-vehicle__remove" aria-label={`Remove ${vehicle.make} ${vehicle.model}`} onClick={() => void handleRemoveVehicle(vehicle.id)}><Trash2 size={16} /></button>
                </div>
              )
            })}
          </div>
        ) : (
          <button type="button" className="account-empty-vehicle" onClick={() => setShowVehicleForm(true)}>
            <span><Car size={24} /></span><div><strong>Add your first vehicle</strong><p>Skip make, model, and year entry when you request help.</p></div><ChevronRight size={18} />
          </button>
        )}
      </section>

      <section className="account-section" aria-labelledby="help-safety-title">
        <div className="account-section__heading"><div><p>HELP & SAFETY</p><h2 id="help-safety-title">Help &amp; safety</h2></div></div>
        <div className="account-menu">
          <button type="button" onClick={() => setShowHelp(true)}><span className="account-menu__icon"><LifeBuoy size={20} /></span><span><strong>Help &amp; Support</strong><small>Report a problem, your reports, common questions</small></span><ChevronRight size={18} /></button>
          <SafetyMenuItem audience="customer" />
          <button type="button" onClick={() => setActiveModal('locationConfirm')}><span className="account-menu__icon"><MapPin size={20} /></span><span><strong>Location preferences</strong><small>Confirm where assistance should arrive</small></span><ChevronRight size={18} /></button>
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

      {isAuthenticated && (
        <>
          <button type="button" className="account-signout" onClick={handleLogout}><LogOut size={17} /> Sign out</button>
          <button type="button" className="account-signout text-red-400" onClick={() => setShowDeleteConfirmation(true)}><Trash2 size={17} /> Delete account</button>
        </>
      )}
      <p className="account-version">AID Roadside · Version 1.0</p>

      {showVehicleForm && (
        <Dialog labelledBy="add-vehicle-title" onClose={() => setShowVehicleForm(false)}>
          <form aria-labelledby="add-vehicle-title" onSubmit={submitVehicle}>
            <div className="account-sheet__header"><div><small>YOUR GARAGE</small><h2 id="add-vehicle-title">Add a vehicle</h2></div><button type="button" aria-label="Close vehicle form" onClick={() => setShowVehicleForm(false)}><X size={20} /></button></div>
            <div className="account-sheet__grid">
              <label><span>Make</span><input required value={vehicleForm.make} onChange={(event) => setVehicleForm({ ...vehicleForm, make: event.target.value })} placeholder="Toyota" /></label>
              <label><span>Model</span><input required value={vehicleForm.model} onChange={(event) => setVehicleForm({ ...vehicleForm, model: event.target.value })} placeholder="Camry" /></label>
              <label><span>Year</span><input required inputMode="numeric" value={vehicleForm.year} onChange={(event) => setVehicleForm({ ...vehicleForm, year: event.target.value })} placeholder="2024" /></label>
              <label><span>Color</span><input value={vehicleForm.color} onChange={(event) => setVehicleForm({ ...vehicleForm, color: event.target.value })} placeholder="Black" /></label>
              <label className="account-sheet__wide"><span>License plate</span><input value={vehicleForm.plate} onChange={(event) => setVehicleForm({ ...vehicleForm, plate: event.target.value })} placeholder="ABC-1234" /></label>
            </div>
            <button type="submit" className="account-sheet__submit">Save vehicle</button>
          </form>
        </Dialog>
      )}
      {showDeleteConfirmation && (
        <Dialog labelledBy="delete-account-title" describedBy="delete-account-text" role="alertdialog" dismissible={!isDeletingAccount} onClose={() => setShowDeleteConfirmation(false)}>
            <div className="account-sheet__header"><div><small>PERMANENT ACTION</small><h2 id="delete-account-title">Permanently delete account?</h2></div><button type="button" aria-label="Close account deletion" disabled={isDeletingAccount} onClick={() => setShowDeleteConfirmation(false)}><X size={20} aria-hidden="true" /></button></div>
            <p id="delete-account-text">This removes your account, saved vehicles, active requests, driver documents, and marketplace history. This cannot be undone.</p>
            {deleteError && <p role="alert" className="text-red-400">{deleteError}</p>}
            <button type="button" className="account-sheet__submit bg-red-600" disabled={isDeletingAccount} onClick={() => void handleDeleteAccount()}>{isDeletingAccount ? 'Deleting account…' : 'Delete my account permanently'}</button>
            <button type="button" className="account-signout" disabled={isDeletingAccount} onClick={() => setShowDeleteConfirmation(false)}>Keep my account</button>
        </Dialog>
      )}
    </div>
  )
}
