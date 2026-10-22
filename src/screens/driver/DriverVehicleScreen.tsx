/**
 * Driver service vehicle & equipment (D5). Customers see the make, model, color and plate when
 * the driver is on the way; complete details are required before going online (server-enforced).
 * Design system: screen title, two-column fields, equipment as one choice list, Save pinned in the
 * thumb zone.
 */

import { useEffect, useId, useState, type FormEvent } from 'react'
import { AlertCircle, Check, ChevronLeft, Info } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { useDriverStore } from '../../store/useDriverStore'
import { apiService, type ServiceOption } from '../../services/api'
import type { Driver } from '../../types'
import {
  EQUIPMENT_OPTIONS, US_STATES, MIN_VEHICLE_YEAR, maxVehicleYear,
  formToVehicle, servicesForEquipment, validateDriverVehicle, vehicleComplete, vehicleToForm,
  type DriverVehicleErrors, type DriverVehicleField, type DriverVehicleForm,
} from '../../lib/driverVehicle'
import Button from '../../components/ui/Button'
import SectionHeader from '../../components/ui/SectionHeader'
import StickyActionBar from '../../components/ui/StickyActionBar'

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
  // Server catalog says which services each equipment type takes; the line is hidden if it can't load.
  const [services, setServices] = useState<ServiceOption[]>([])
  useEffect(() => {
    let active = true
    void apiService.listServices().then((result) => {
      if (active && result.success && result.data) setServices(result.data)
    })
    return () => { active = false }
  }, [])
  const equipmentServices = servicesForEquipment(services, form.equipmentType)

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
    className: field === 'plateState' ? 'ui-input ui-select' : 'ui-input',
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `${id}-${field}-error` : undefined,
  })
  const fieldError = (field: DriverVehicleField) => errors[field] && (
    <small id={`${id}-${field}-error`} className="ui-field-error">{errors[field]}</small>
  )
  const field = (name: DriverVehicleField, label: string, control: React.ReactNode) => (
    <div className="ui-field">
      <label htmlFor={`${id}-${name}`}>{label}</label>
      {control}
      {fieldError(name)}
    </div>
  )

  return (
    <div className="ui-screen driver-form safe-top">
      <button type="button" className="ui-back" onClick={onBack} disabled={isSaving}><ChevronLeft size={22} aria-hidden="true" /> {backLabel}</button>

      <header className="ui-screen-title">
        <h1>{isEditing ? 'Your vehicle' : 'Add your vehicle'}</h1>
        <p>{isIncomplete
          ? 'Add the model year, plate state and equipment type to finish your vehicle details.'
          : 'Customers see your vehicle, color and plate so they know who to look for. Required before you go online.'}</p>
      </header>

      <form className="driver-form__body" onSubmit={(event) => void handleSubmit(event)} noValidate aria-label="Vehicle details">
        <section className="ui-section" aria-labelledby={`${id}-vehicle-title`}>
          <SectionHeader id={`${id}-vehicle-title`} title="Vehicle" />
          <div className="sheet-grid">
            {field('make', 'Make', <input {...fieldProps('make')} autoComplete="off" maxLength={40} placeholder="Ford" value={form.make} onChange={(event) => update('make', event.target.value)} />)}
            {field('model', 'Model', <input {...fieldProps('model')} autoComplete="off" maxLength={60} placeholder="F-550" value={form.model} onChange={(event) => update('model', event.target.value)} />)}
            {field('year', 'Year', <input {...fieldProps('year')} inputMode="numeric" autoComplete="off" maxLength={4} placeholder={`${MIN_VEHICLE_YEAR}–${maxVehicleYear()}`}
              value={form.year} onChange={(event) => update('year', event.target.value.replace(/\D/g, ''))} />)}
            {field('color', 'Color', <input {...fieldProps('color')} autoComplete="off" maxLength={30} placeholder="White" value={form.color} onChange={(event) => update('color', event.target.value)} />)}
            {field('plate', 'License plate', <input {...fieldProps('plate')} autoComplete="off" autoCapitalize="characters" maxLength={12} placeholder="TOW-77" value={form.plate}
              onChange={(event) => update('plate', event.target.value.toUpperCase())} />)}
            {field('plateState', 'Plate state', (
              <select {...fieldProps('plateState')} value={form.plateState} onChange={(event) => update('plateState', event.target.value)}>
                <option value="">Select</option>
                {US_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
              </select>
            ))}
          </div>
        </section>

        <section className="ui-section">
          <fieldset className="sheet-fieldset driver-form__equipment" aria-describedby={errors.equipmentType ? `${id}-equipmentType-error` : undefined}>
            <legend className="ui-section-header"><h2>Equipment</h2></legend>
            <p className="driver-form__hint">What does your vehicle carry? This decides which jobs you're offered.</p>
            <div className="choice-list">
              {EQUIPMENT_OPTIONS.map((option, index) => {
                const selected = form.equipmentType === option.id
                return (
                  <label key={option.id} className={`choice choice--detail${selected ? ' is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="equipmentType"
                      id={index === 0 ? `${id}-equipmentType` : undefined}
                      value={option.id}
                      checked={selected}
                      disabled={isSaving}
                      onChange={() => update('equipmentType', option.id)}
                    />
                    <span className="choice__text"><strong>{option.label}</strong><small>{option.detail}</small></span>
                    <span className="choice__check" aria-hidden="true">{selected && <Check size={14} strokeWidth={3} />}</span>
                  </label>
                )
              })}
            </div>
            {equipmentServices.length > 0 && (
              <p className="ui-alert driver-form__capability" aria-live="polite"><Info size={16} aria-hidden="true" /> <span>Jobs you'll be offered: {equipmentServices.join(', ')}.</span></p>
            )}
            {fieldError('equipmentType')}
          </fieldset>
        </section>

        <StickyActionBar>
          {formError && <p role="alert" className="ui-alert ui-alert--danger"><AlertCircle size={16} aria-hidden="true" /> {formError}</p>}
          <Button type="submit" block size="lg" loading={isSaving} loadingLabel="Saving…">
            {isEditing ? 'Save vehicle' : 'Add vehicle'}
          </Button>
        </StickyActionBar>
      </form>
    </div>
  )
}
