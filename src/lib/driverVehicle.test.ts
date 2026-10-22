import { describe, expect, it } from 'vitest'
import { driverVehicleSummary, equipmentLabel, formToVehicle, validateDriverVehicle, vehicleComplete, vehicleToForm, type DriverVehicleForm } from './driverVehicle'

const valid: DriverVehicleForm = { make: 'Ford', model: 'F-550', year: '2021', color: 'White', plate: 'TOW-77', plateState: 'TX', equipmentType: 'flatbed' }
const NOW = new Date('2026-10-22T12:00:00Z')

describe('driver vehicle rules (mirror server/driverVehicle.js)', () => {
  it('accepts a complete vehicle', () => {
    expect(validateDriverVehicle(valid, NOW)).toEqual({})
  })

  it('bounds the model year from 1980 to next year', () => {
    expect(validateDriverVehicle({ ...valid, year: '2027' }, NOW).year).toBeUndefined()
    expect(validateDriverVehicle({ ...valid, year: '2028' }, NOW).year).toMatch(/1980 and 2027/)
    expect(validateDriverVehicle({ ...valid, year: '1979' }, NOW).year).toBeTruthy()
    expect(validateDriverVehicle({ ...valid, year: '21' }, NOW).year).toBeTruthy()
  })

  it('checks plate format, state and equipment', () => {
    expect(validateDriverVehicle({ ...valid, plate: 'abc 1234' }, NOW).plate).toBeUndefined()
    expect(validateDriverVehicle({ ...valid, plate: 'A' }, NOW).plate).toBeTruthy()
    expect(validateDriverVehicle({ ...valid, plate: 'ABCDE12345' }, NOW).plate).toBeTruthy()
    expect(validateDriverVehicle({ ...valid, plate: 'AB_12' }, NOW).plate).toBeTruthy()
    expect(validateDriverVehicle({ ...valid, plateState: 'ZZ' }, NOW).plateState).toBeTruthy()
    expect(validateDriverVehicle({ ...valid, equipmentType: '' }, NOW).equipmentType).toBeTruthy()
  })

  it('cleans the payload sent to the server', () => {
    expect(formToVehicle({ ...valid, make: '  Ford  Motor ', plate: ' tow-77 ' })).toEqual({
      make: 'Ford Motor', model: 'F-550', year: 2021, color: 'White', plate: 'TOW-77', plateState: 'TX', equipmentType: 'flatbed',
    })
  })

  it('treats vehicles saved before D5 as incomplete and round-trips the form', () => {
    const saved = formToVehicle(valid)
    expect(vehicleComplete(saved)).toBe(true)
    expect(vehicleComplete({ ...saved, equipmentType: '' })).toBe(false)
    expect(vehicleComplete({ ...saved, year: null })).toBe(false)
    expect(vehicleComplete(null)).toBe(false)
    expect(vehicleToForm(saved)).toEqual(valid)
    expect(vehicleToForm({ ...saved, year: null }).year).toBe('')
  })

  it('summarises the saved vehicle for the driver', () => {
    expect(driverVehicleSummary(formToVehicle(valid))).toBe('2021 White Ford F-550 · TOW-77 (TX)')
    expect(driverVehicleSummary(null)).toBeNull()
    expect(equipmentLabel('wheel_lift')).toBe('Wheel-lift tow truck')
    expect(equipmentLabel('')).toBeNull()
  })
})
