/**
 * The driver's service vehicle and equipment. Mirrors server/driverVehicle.js so the form can
 * show errors inline; the server stays authoritative and returns the failing `field`.
 */

import type { DriverEquipmentType, DriverVehicle } from '../types'

export const EQUIPMENT_OPTIONS: ReadonlyArray<{ id: DriverEquipmentType; label: string; detail: string }> = [
  { id: 'flatbed', label: 'Flatbed / rollback', detail: 'Tows any car, including AWD and EVs' },
  { id: 'wheel_lift', label: 'Wheel-lift tow truck', detail: 'Tows most two-wheel-drive cars, but not electric cars' },
  { id: 'light_duty', label: 'Light-duty service vehicle', detail: 'Jump-starts, tires, lockouts and fuel — no towing' },
]

/** The parts of a server catalog entry (GET /api/services) needed to say which jobs equipment takes. */
export interface EquipmentServiceOption {
  name: string
  available: boolean
  equipmentTypes?: readonly string[]
}

/**
 * Names of the services a driver with this equipment is offered, taken from the server catalog
 * (the server decides; see SERVICE_EQUIPMENT in server/driverVehicle.js). Unavailable services are left out.
 */
export function servicesForEquipment(services: readonly EquipmentServiceOption[], equipmentType: DriverEquipmentType | '' | null | undefined): string[] {
  if (!equipmentType) return []
  return services.filter((service) => service.available && service.equipmentTypes?.includes(equipmentType)).map((service) => service.name)
}


export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA',
  'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR',
  'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
] as const

export const MIN_VEHICLE_YEAR = 1980
export const maxVehicleYear = (now = new Date()) => now.getUTCFullYear() + 1

const PLATE_PATTERN = /^[A-Z0-9]+(?:[ -][A-Z0-9]+)*$/

/** Form state: everything is text until it is validated. */
export interface DriverVehicleForm {
  make: string
  model: string
  year: string
  color: string
  plate: string
  plateState: string
  equipmentType: DriverEquipmentType | ''
}

export type DriverVehicleField = keyof DriverVehicleForm
export type DriverVehicleErrors = Partial<Record<DriverVehicleField, string>>

export function vehicleToForm(vehicle: DriverVehicle | null | undefined): DriverVehicleForm {
  return {
    make: vehicle?.make ?? '',
    model: vehicle?.model ?? '',
    year: vehicle?.year ? String(vehicle.year) : '',
    color: vehicle?.color ?? '',
    plate: vehicle?.plate ?? '',
    plateState: vehicle?.plateState ?? '',
    equipmentType: vehicle?.equipmentType ?? '',
  }
}

const clean = (value: string) => value.trim().replace(/\s+/g, ' ')

/** Every problem at once, so the driver can fix the whole form in one pass. */
export function validateDriverVehicle(form: DriverVehicleForm, now = new Date()): DriverVehicleErrors {
  const errors: DriverVehicleErrors = {}
  if (!clean(form.make)) errors.make = 'Enter the vehicle make'
  if (!clean(form.model)) errors.model = 'Enter the vehicle model'
  const year = /^\d{4}$/.test(form.year.trim()) ? Number(form.year.trim()) : NaN
  if (!(year >= MIN_VEHICLE_YEAR && year <= maxVehicleYear(now))) errors.year = `Enter a year between ${MIN_VEHICLE_YEAR} and ${maxVehicleYear(now)}`
  if (!clean(form.color)) errors.color = 'Enter the vehicle color'
  const plate = clean(form.plate).toUpperCase()
  const plateChars = plate.replace(/[ -]/g, '').length
  if (!plate) errors.plate = 'Enter the license plate'
  else if (!PLATE_PATTERN.test(plate) || plateChars < 2 || plateChars > 8) errors.plate = 'Plates use 2–8 letters or numbers (spaces or dashes allowed)'
  if (!(US_STATES as readonly string[]).includes(form.plateState)) errors.plateState = 'Choose the state the plate is registered in'
  if (!EQUIPMENT_OPTIONS.some((option) => option.id === form.equipmentType)) errors.equipmentType = 'Choose your equipment type'
  return errors
}

/** The payload sent to PATCH /api/drivers/me/vehicle (call only after validation passes). */
export function formToVehicle(form: DriverVehicleForm): DriverVehicle {
  return {
    make: clean(form.make),
    model: clean(form.model),
    year: Number(form.year.trim()),
    color: clean(form.color),
    plate: clean(form.plate).toUpperCase(),
    plateState: form.plateState,
    equipmentType: form.equipmentType as DriverEquipmentType,
  }
}

/** Mirrors server driverVehicleComplete: required before going online or accepting work. */
export function vehicleComplete(vehicle: DriverVehicle | null | undefined): boolean {
  return Boolean(vehicle && vehicle.make && vehicle.model && Number.isInteger(vehicle.year) && vehicle.color && vehicle.plate &&
    (US_STATES as readonly string[]).includes(vehicle.plateState) && EQUIPMENT_OPTIONS.some((option) => option.id === vehicle.equipmentType))
}

export function equipmentLabel(type: DriverEquipmentType | '' | null | undefined): string | null {
  return EQUIPMENT_OPTIONS.find((option) => option.id === type)?.label ?? null
}

/** "2021 White Ford F-550 · TOW-77 (TX)" — what the driver sees as their saved vehicle. */
export function driverVehicleSummary(vehicle: DriverVehicle | null | undefined): string | null {
  if (!vehicle?.make) return null
  const name = [vehicle.year, vehicle.color, vehicle.make, vehicle.model].filter(Boolean).join(' ')
  const plate = vehicle.plate ? ` · ${vehicle.plate}${vehicle.plateState ? ` (${vehicle.plateState})` : ''}` : ''
  return `${name}${plate}`
}

export const VEHICLE_REQUIRED_COPY = {
  title: 'Add your vehicle',
  detail: 'Customers look for your vehicle and plate when you arrive. Add your vehicle and equipment to go online.',
  incompleteDetail: 'Your vehicle details are missing the year, plate state or equipment type. Finish them to go online.',
  action: 'Add vehicle',
}
