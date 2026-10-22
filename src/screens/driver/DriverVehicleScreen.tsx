/**
 * Driver service vehicle & equipment (D5). Customers see the make, model, color and plate when
 * the driver is on the way; complete details are required before going online (server-enforced).
 */

import { useId, useState, type FormEvent } from 'react'
import { AlertCircle, ArrowLeft, Check, Loader2, Truck } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { useDriverStore } from '../../store/useDriverStore'
import type { Driver } from '../../types'
import {
  EQUIPMENT_OPTIONS, US_STATES, MIN_VEHICLE_YEAR, maxVehicleYear,
  formToVehicle, validateDriverVehicle, vehicleComplete, vehicleToForm,
  type DriverVehicleErrors, type DriverVehicleField, type DriverVehicleForm,
} from '../../lib/driverVehicle'

interface DriverVehicleScreenProps {
  onBack: () => void
  /** Called after a successful save. */
  onSaved: () => void
  backLabel?: string
}

const FIELD_ORDER: DriverVehicleField[] = ['make', 'model', 'year', 'color', 'plate', 'plateState', 'equipmentType']

export default function DriverVehicleScreen({ onBack, onSaved, backLabel = 'Back' }: DriverVehicleScreenProps) {
  const user = useAuthStore((state) => state.user) as Driver | null
  const saveVehicle = useDriverStore((state) => state.saveVehicle)
  const saved = user?.vehicle ?? null
  const [form, setForm] = useState<DriverVehicleForm>(() => vehicleToForm(saved))
  const [errors, setErrors] = useState<DriverVehicleErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const id = useId()
  const isEditing = Boolean(saved?.make)
  const isIncomplete = isEditing && !vehicleComplete(saved)

  const update = (field: DriverVehicleField, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const focusFirstError = (found: DriverVehicleErrors) => {
    const first = FIELD_ORDER.find((field) => found[field])
    if (first) document.getElementById(`${id}-${first}`)?.focus()
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (isSaving) return
    setFormError(null)
    const found = validateDriverVehicle(form)
    setErrors(found)
    if (Object.keys(found).length) return focusFirstError(found)

    setIsSaving(true)
    const result = await saveVehicle(formToVehicle(form))
    setIsSaving(false)
    if (result.ok) return onSaved()
    if (result.field && (FIELD_ORDER as string[]).includes(result.field)) {
      const serverErrors = { [result.field]: result.error } as DriverVehicleErrors
      setErrors(serverErrors)
      focusFirstError(serverErrors)
    } else {
      setFormError(result.error)
    }
  }

  const fieldProps = (field: DriverVehicleField) => ({
    id: `${id}-${field}`,
    name: field,
    disabled: isSaving,
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `${id}-${field}-error` : undefined,
  })
  const fieldError = (field: DriverVehicleField) => errors[field] && (
    <small id={`${id}-${field}-error`} className="vehicle-form__error">{errors[field]}</small>
  )

  return (
    <div className="driver-work verify safe-top safe-bottom">
      <button type="button" className="verify__back" onClick={onBack} disabled={isSaving}><ArrowLeft size={18} aria-hidden="true" /> {backLabel}</button>

      <header className="verify-status">
        <Truck size={22} aria-hidden="true" />
        <div>
          <h1>{isEditing ? 'Your vehicle' : 'Add your vehicle'}</h1>
          <p>{isIncomplete
            ? 'Add the model year, plate state and equipment type to finish your vehicle details.'
            : 'Customers see your vehicle, color and plate so they know who to look for. Required before you go online.'}</p>
        </div>
      </header>

      <form className="vehicle-form" onSubmit={(event) => void handleSubmit(event)} noValidate aria-label="Vehicle details">
        <section className="driver-section" aria-labelledby={`${id}-vehicle-title`}>
          <div className="driver-section__heading"><div><span>SERVICE VEHICLE</span><h2 id={`${id}-vehicle-title`}>Vehicle</h2></div></div>
          <div className="vehicle-form__grid">
            <div className="verify-sheet__field">
              <label htmlFor={`${id}-make`}>Make</label>
              <input {...fieldProps('make')} autoComplete="off" maxLength={40} placeholder="e.g. Ford" value={form.make} onChange={(event) => update('make', event.target.value)} />
              {fieldError('make')}
            </div>
            <div className="verify-sheet__field">
              <label htmlFor={`${id}-model`}>Model</label>
              <input {...fieldProps('model')} autoComplete="off" maxLength={60} placeholder="e.g. F-550" value={form.model} onChange={(event) => update('model', event.target.value)} />
              {fieldError('model')}
            </div>
            <div className="verify-sheet__field">
              <label htmlFor={`${id}-year`}>Year</label>
              <input {...fieldProps('year')} inputMode="numeric" autoComplete="off" maxLength={4} placeholder={`${MIN_VEHICLE_YEAR}–${maxVehicleYear()}`}
                value={form.year} onChange={(event) => update('year', event.target.value.replace(/\D/g, ''))} />
              {fieldError('year')}
            </div>
            <div className="verify-sheet__field">
              <label htmlFor={`${id}-color`}>Color</label>
              <input {...fieldProps('color')} autoComplete="off" maxLength={30} placeholder="e.g. White" value={form.color} onChange={(event) => update('color', event.target.value)} />
              {fieldError('color')}
            </div>
            <div className="verify-sheet__field">
              <label htmlFor={`${id}-plate`}>License plate</label>
              <input {...fieldProps('plate')} autoComplete="off" autoCapitalize="characters" maxLength={12} placeholder="e.g. TOW-77" value={form.plate}
                onChange={(event) => update('plate', event.target.value.toUpperCase())} />
              {fieldError('plate')}
            </div>
            <div className="verify-sheet__field">
              <label htmlFor={`${id}-plateState`}>Plate state</label>
              <select {...fieldProps('plateState')} value={form.plateState} onChange={(event) => update('plateState', event.target.value)}>
                <option value="">Select</option>
                {US_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
              </select>
              {fieldError('plateState')}
            </div>
          </div>
        </section>

        <section className="driver-section">
          <fieldset className="vehicle-form__equipment" aria-describedby={errors.equipmentType ? `${id}-equipmentType-error` : undefined}>
            <legend className="vehicle-form__legend"><span>EQUIPMENT</span><h2>What does it carry?</h2></legend>
            <div className="verify-list">
              {EQUIPMENT_OPTIONS.map((option, index) => {
                const selected = form.equipmentType === option.id
                return (
                  <label key={option.id} className={`verify-item vehicle-option ${selected ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="equipmentType"
                      id={index === 0 ? `${id}-equipmentType` : undefined}
                      value={option.id}
                      checked={selected}
                      disabled={isSaving}
                      onChange={() => update('equipmentType', option.id)}
                    />
                    <span className="verify-item__copy"><strong>{option.label}</strong><small>{option.detail}</small></span>
                    <span className="vehicle-option__check" aria-hidden="true">{selected && <Check size={16} />}</span>
                  </label>
                )
              })}
            </div>
            {fieldError('equipmentType')}
          </fieldset>
        </section>

        <footer className="verify-footer">
          {formError && <p role="alert" className="verify-sheet__error"><AlertCircle size={16} aria-hidden="true" /> {formError}</p>}
          <button type="submit" className="aid-primary-button vehicle-form__submit" disabled={isSaving}>
            {isSaving && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
            {isSaving ? 'Saving…' : isEditing ? 'Save vehicle' : 'Add vehicle'}
          </button>
        </footer>
      </form>
    </div>
  )
}
