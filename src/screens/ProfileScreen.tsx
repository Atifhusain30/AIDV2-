/**
 * Customer Account: who you are, your garage (the saved vehicle makes the next request two taps),
 * help & safety, contact details, sign out and account deletion. Only real data — nothing is
 * invented when a field is empty. F5: the garage shows a skeleton while loading, an error with
 * Try again, and an honest empty state.
 */

import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { AlertCircle, Car, LifeBuoy, LogOut, MapPin, Plus, Trash2 } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { useAuthStore } from '../store/useAuthStore'
import { apiService } from '../services/api'
import { signOut } from '../auth/signOut'
import { SafetyMenuItem } from '../components/safety/Safety'
import BottomSheet from '../components/ui/BottomSheet'
import Button from '../components/ui/Button'
import { List, ListRow } from '../components/ui/ListRow'
import PersonAvatar from '../components/ui/PersonAvatar'
import SectionHeader from '../components/ui/SectionHeader'
import { SkeletonRows } from '../components/ui/Skeleton'
import { ErrorState } from '../components/ui/States'
import HelpSupportScreen from './HelpSupportScreen'

const emptyVehicle = { make: '', model: '', year: '', color: '', plate: '' }

function AddVehicleSheet({ onClose, onSave }: { onClose: () => void; onSave: (input: { make: string; model: string; year: number; color: string; plate: string }) => Promise<string | null> }) {
  const [form, setForm] = useState(emptyVehicle)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const formId = useId()
  const set = (key: keyof typeof emptyVehicle) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const year = Number(form.year)
    if (!form.make.trim() || !form.model.trim() || !year) { setError('Add the make, model and year.'); return }
    setSaving(true)
    setError(null)
    const failure = await onSave({
      make: form.make.trim(),
      model: form.model.trim(),
      year,
      color: form.color.trim() || 'Not specified',
      plate: form.plate.trim() || 'Not added',
    })
    setSaving(false)
    if (failure) setError(failure)
  }

  return (
    <BottomSheet title="Add a vehicle" titleId="add-vehicle-title" subtitle="Saved to your garage for faster requests." onClose={onClose} dismissible={!saving} closeLabel="Close vehicle form"
      footer={(
        <>
          {error && <p className="ui-alert ui-alert--danger" role="alert"><AlertCircle size={16} aria-hidden="true" /> {error}</p>}
          <Button type="submit" form={formId} block size="lg" loading={saving} loadingLabel="Saving…">Save vehicle</Button>
        </>
      )}>
      <form id={formId} aria-labelledby="add-vehicle-title" onSubmit={(event) => void submit(event)} className="sheet-grid">
        <label className="ui-field"><span>Make</span><input className="ui-input" required value={form.make} onChange={set('make')} placeholder="Toyota" autoComplete="off" /></label>
        <label className="ui-field"><span>Model</span><input className="ui-input" required value={form.model} onChange={set('model')} placeholder="Camry" autoComplete="off" /></label>
        <label className="ui-field"><span>Year</span><input className="ui-input" required inputMode="numeric" value={form.year} onChange={set('year')} placeholder="2024" /></label>
        <label className="ui-field"><span>Color</span><input className="ui-input" value={form.color} onChange={set('color')} placeholder="Black" /></label>
        <label className="ui-field sheet-grid__wide"><span>License plate</span><input className="ui-input" value={form.plate} onChange={set('plate')} placeholder="ABC-1234" autoCapitalize="characters" /></label>
      </form>
    </BottomSheet>
  )
}

export default function ProfileScreen() {
  const { user: profile, vehicles, activeVehicleId, addVehicle, removeVehicle, setActiveVehicle, setVehicles, setActiveModal } = useAppStore()
  const { user: authUser, isAuthenticated, token } = useAuthStore()
  const [showVehicleForm, setShowVehicleForm] = useState(false)
  const [garage, setGarage] = useState<'loading' | 'ready' | 'error'>(token ? 'loading' : 'ready')
  const [garageError, setGarageError] = useState<string | null>(null)
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const [editingGarage, setEditingGarage] = useState(false)
  // Leave edit mode once the last vehicle is gone.
  useEffect(() => { if (vehicles.length === 0) setEditingGarage(false) }, [vehicles.length])

  const loadVehicles = useCallback(async () => {
    if (!token) return
    setGarage('loading')
    const result = await apiService.listVehicles()
    if (result.success && result.data) { setVehicles(result.data); setGarage('ready') }
    else { setGarageError(result.error || 'Unable to load your vehicles.'); setGarage('error') }
  }, [token, setVehicles])
  useEffect(() => { void loadVehicles() }, [loadVehicles])

  const name = profile?.name || (authUser ? `${authUser.firstName} ${authUser.lastName}`.trim() : '')
  const email = profile?.email || authUser?.email
  const phone = profile?.phone || authUser?.phone

  const saveVehicle = async (input: { make: string; model: string; year: number; color: string; plate: string }) => {
    if (token) {
      const result = await apiService.createVehicle(input)
      if (!result.success || !result.data) return result.error || 'Unable to save vehicle.'
      setVehicles([result.data, ...vehicles])
    } else {
      addVehicle(input)
    }
    setShowVehicleForm(false)
    return null
  }

  const handleRemoveVehicle = async (vehicleId: string) => {
    setGarageError(null)
    if (token) {
      const result = await apiService.deleteVehicle(vehicleId)
      if (!result.success) { setGarageError(result.error || 'Unable to remove vehicle.'); return }
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

  const garageBody = vehicles.length === 0 && garage === 'loading'
    ? <SkeletonRows count={1} label="Loading your vehicles" />
    : vehicles.length === 0 && garage === 'error'
      ? <ErrorState compact title="Couldn't load your garage" body={garageError} onRetry={() => void loadVehicles()} />
      : vehicles.length === 0
        ? (
          <List>
            <ListRow icon={<Plus size={20} />} tone="brand" title="Add your first vehicle" subtitle="Skip make, model and year next time" hasPopup onClick={() => setShowVehicleForm(true)} />
          </List>
        )
        : (
          // Removing a vehicle is behind Edit (iOS / Uber pattern) so the list stays one clean column.
          <ul className={`ui-list garage-list${editingGarage ? ' is-editing' : ''}`} aria-label="Your vehicles">
            {vehicles.map((vehicle) => {
              const active = vehicle.id === activeVehicleId || (!activeVehicleId && vehicle.id === vehicles[0].id)
              const label = `${vehicle.year} ${vehicle.make} ${vehicle.model}`
              return (
                <li className={`garage-row${active ? ' is-active' : ''}`} key={vehicle.id}>
                  <button type="button" className="ui-row garage-row__select" onClick={() => setActiveVehicle(vehicle.id)} aria-pressed={active}>
                    <span className="ui-row__icon" aria-hidden="true"><Car size={20} /></span>
                    <span className="ui-row__text"><strong>{label}</strong><small>{[vehicle.color, vehicle.plate].filter(Boolean).join(' · ')}</small></span>
                    {active && !editingGarage && <span className="ui-chip ui-chip--brand">Default</span>}
                  </button>
                  {editingGarage && (
                    <button type="button" className="garage-row__remove" aria-label={`Remove ${vehicle.make} ${vehicle.model}`} onClick={() => void handleRemoveVehicle(vehicle.id)}>
                      Remove
                    </button>
                  )}
                </li>
              )
            })}
            {!editingGarage && (
              <li className="garage-row">
                <ListRow className="garage-row__add" icon={<Plus size={20} />} tone="brand" title="Add vehicle" chevron={false} hasPopup onClick={() => setShowVehicleForm(true)} />
              </li>
            )}
          </ul>
        )

  return (
    <div className="ui-screen account-screen">
      <header className="ui-screen-title"><h1>Account</h1></header>

      {/* Uber-style identity: big name and avatar on the canvas, no boxed card. */}
      <section className="account-identity" aria-label="Account profile">
        <div>
          <strong>{name || 'Guest account'}</strong>
          {!email && !phone && <small>Your roadside settings are saved on this device</small>}
          {email && <small>{email}</small>}
          {phone && <small>{phone}</small>}
        </div>
        <PersonAvatar name={name} size="lg" />
      </section>

      <section className="ui-section" aria-labelledby="account-garage-title">
        <SectionHeader id="account-garage-title" title="Your garage"
          action={vehicles.length > 0 ? { label: editingGarage ? 'Done' : 'Edit', ariaLabel: editingGarage ? 'Done editing garage' : 'Edit garage', onClick: () => setEditingGarage((value) => !value) } : undefined} />
        {garageError && vehicles.length > 0 && <p className="ui-alert ui-alert--danger garage-error" role="alert"><AlertCircle size={16} aria-hidden="true" /> {garageError}</p>}
        {garageBody}
      </section>

      <section className="ui-section" aria-labelledby="help-safety-title">
        <SectionHeader id="help-safety-title" title="Help & safety" />
        <List>
          <ListRow icon={<LifeBuoy size={19} />} title="Help & Support" subtitle="Report a problem, get answers" onClick={() => setShowHelp(true)} />
          <SafetyMenuItem audience="customer" />
          <ListRow icon={<MapPin size={19} />} title="Location" subtitle="Where help should arrive" hasPopup onClick={() => setActiveModal('locationConfirm')} />
        </List>
      </section>

      {isAuthenticated && (
        <section className="ui-section" aria-label="Sign out and account deletion">
          <List>
            <ListRow icon={<LogOut size={19} />} title="Sign out" chevron={false} onClick={handleLogout} />
            <ListRow icon={<Trash2 size={19} />} title="Delete account" tone="danger" chevron={false} hasPopup onClick={() => setShowDeleteConfirmation(true)} />
          </List>
        </section>
      )}
      <p className="account-version">AID Roadside · Version 1.0</p>

      {showVehicleForm && <AddVehicleSheet onClose={() => setShowVehicleForm(false)} onSave={saveVehicle} />}
      {showDeleteConfirmation && (
        <BottomSheet title="Permanently delete account?" titleId="delete-account-title" describedBy="delete-account-text" role="alertdialog" showClose={false}
          dismissible={!isDeletingAccount} onClose={() => setShowDeleteConfirmation(false)}
          footer={(
            <>
              {deleteError && <p role="alert" className="ui-alert ui-alert--danger"><AlertCircle size={16} aria-hidden="true" /> {deleteError}</p>}
              <Button variant="destructive" block size="lg" loading={isDeletingAccount} loadingLabel="Deleting account…" onClick={() => void handleDeleteAccount()}>Delete my account permanently</Button>
              <Button variant="secondary" block disabled={isDeletingAccount} onClick={() => setShowDeleteConfirmation(false)}>Keep my account</Button>
            </>
          )}>
          <p id="delete-account-text" className="sheet-text">This removes your account, saved vehicles, active requests, driver documents and marketplace history. This cannot be undone.</p>
        </BottomSheet>
      )}
    </div>
  )
}
