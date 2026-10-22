/**
 * The customer's garage (saved vehicles), shared by the Garage tab and the Account summary.
 * Vehicles come from the server (GET/POST/DELETE /api/vehicles); the default one fills in every
 * request so it stays a few taps. F5: skeleton while loading, an error with Try again, honest empty.
 */

import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { AlertCircle, Car, Plus } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { useAuthStore } from '../../store/useAuthStore'
import { apiService } from '../../services/api'
import BottomSheet from '../ui/BottomSheet'
import Button from '../ui/Button'
import { List, ListRow } from '../ui/ListRow'
import { SkeletonRows } from '../ui/Skeleton'
import { ErrorState } from '../ui/States'
import VehicleCard, { vehicleName } from '../ui/VehicleCard'
import StatusPill from '../ui/StatusPill'

type VehicleInput = { make: string; model: string; year: number; color: string; plate: string }
const emptyVehicle = { make: '', model: '', year: '', color: '', plate: '' }

export function AddVehicleSheet({ onClose, onSave }: { onClose: () => void; onSave: (input: VehicleInput) => Promise<string | null> }) {
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

/** Garage data + actions (load, add, remove) with the server, falling back to this device when signed out. */
export function useGarage() {
  const { vehicles, activeVehicleId, addVehicle, removeVehicle, setActiveVehicle, setVehicles } = useAppStore()
  const token = useAuthStore((state) => state.token)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(token ? 'loading' : 'ready')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    setStatus('loading')
    const result = await apiService.listVehicles()
    if (result.success && result.data) { setVehicles(result.data); setStatus('ready') }
    else { setError(result.error || 'Unable to load your vehicles.'); setStatus('error') }
  }, [token, setVehicles])
  useEffect(() => { void load() }, [load])

  const save = async (input: VehicleInput): Promise<string | null> => {
    if (token) {
      const result = await apiService.createVehicle(input)
      if (!result.success || !result.data) return result.error || 'Unable to save vehicle.'
      setVehicles([result.data, ...useAppStore.getState().vehicles])
    } else {
      addVehicle(input)
    }
    return null
  }

  const remove = async (vehicleId: string) => {
    setError(null)
    if (token) {
      const result = await apiService.deleteVehicle(vehicleId)
      if (!result.success) { setError(result.error || 'Unable to remove vehicle.'); return }
      setVehicles(useAppStore.getState().vehicles.filter((vehicle) => vehicle.id !== vehicleId))
      return
    }
    removeVehicle(vehicleId)
  }

  const defaultId = activeVehicleId && vehicles.some((vehicle) => vehicle.id === activeVehicleId) ? activeVehicleId : vehicles[0]?.id ?? null
  return { vehicles, defaultId, status, error, load, save, remove, setDefault: setActiveVehicle }
}

/**
 * The garage list. `editing` shows a red Remove on each vehicle (iOS pattern); otherwise tapping a
 * vehicle makes it the default for requests, and "Add vehicle" sits underneath.
 */
export function GarageList({ garage, editing = false, onAdd }: { garage: ReturnType<typeof useGarage>; editing?: boolean; onAdd: () => void }) {
  const { vehicles, defaultId, status, error } = garage
  if (vehicles.length === 0 && status === 'loading') return <SkeletonRows count={1} label="Loading your vehicles" />
  if (vehicles.length === 0 && status === 'error') return <ErrorState compact title="Couldn't load your garage" body={error} onRetry={() => void garage.load()} />
  if (vehicles.length === 0) {
    return (
      <List>
        <ListRow icon={<Plus size={20} />} tone="brand" title="Add your first vehicle" subtitle="Skip make, model and year next time" hasPopup onClick={onAdd} />
      </List>
    )
  }
  return (
    <div className="garage">
      {error && <p className="ui-alert ui-alert--danger garage-error" role="alert"><AlertCircle size={16} aria-hidden="true" /> {error}</p>}
      <ul className="garage-cards" aria-label="Your vehicles">
        {vehicles.map((vehicle) => {
          const isDefault = vehicle.id === defaultId
          return (
            <li key={vehicle.id} className="garage-card">
              {editing ? (
                <VehicleCard vehicle={vehicle} trailing={(
                  <button type="button" className="garage-row__remove" aria-label={`Remove ${vehicle.make} ${vehicle.model}`} onClick={() => void garage.remove(vehicle.id)}>Remove</button>
                )} />
              ) : (
                <button type="button" className="ui-vehicle garage-card__select" aria-pressed={isDefault}
                  aria-label={`${vehicleName(vehicle)}${isDefault ? ', default for requests' : ', use for requests'}`} onClick={() => garage.setDefault(vehicle.id)}>
                  <VehicleCardBody vehicle={vehicle} />
                  {isDefault && <StatusPill tone="brand">Default</StatusPill>}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {!editing && (
        <button type="button" className="garage-add" aria-haspopup="dialog" onClick={onAdd}>
          <Plus size={18} aria-hidden="true" /> Add vehicle
        </button>
      )}
    </div>
  )
}

function VehicleCardBody({ vehicle }: { vehicle: { year?: number; make?: string; model?: string; color?: string; plate?: string } }) {
  const meta = [vehicle.color, vehicle.plate].filter(Boolean).join(' · ')
  return (
    <>
      <span className="ui-vehicle__icon" aria-hidden="true"><Car size={22} /></span>
      <span className="ui-vehicle__text"><strong>{vehicleName(vehicle)}</strong>{meta && <span>{meta}</span>}</span>
    </>
  )
}
