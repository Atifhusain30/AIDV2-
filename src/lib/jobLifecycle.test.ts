import { describe, expect, it } from 'vitest'
import {
  CUSTOMER_CANCELLABLE, DRIVER_CANCELLABLE, DRIVER_CANCEL_REASONS, CUSTOMER_CANCEL_REASONS,
  customerCancelText, customerNoCancelText, customerStatusLine, driverNextAction,
} from './jobLifecycle'
import type { BookingStatus } from '../types'

const tow = { dropoffLocation: { address: 'Garage', lat: 1, lng: 1 } }

describe('job lifecycle (client mirror of server/lifecycle.js)', () => {
  it('walks the driver through accepted → en_route → arrived → in_progress → completed', () => {
    const path: BookingStatus[] = []
    let status: BookingStatus = 'accepted'
    for (let action = driverNextAction({ status }); action; action = driverNextAction({ status })) {
      path.push(action.next)
      status = action.next
    }
    expect(path).toEqual(['en_route', 'arrived', 'in_progress', 'completed'])
  })

  it('labels each driver step, with tow wording and confirmation only on complete', () => {
    expect(driverNextAction({ status: 'accepted' }, 'Casey')).toMatchObject({ label: 'Start driving', hint: "Lets Casey know you're on the way", confirm: false })
    expect(driverNextAction({ status: 'en_route' })).toMatchObject({ label: "I've arrived", confirm: false })
    expect(driverNextAction({ status: 'arrived' })).toMatchObject({ label: 'Start service', confirm: false })
    expect(driverNextAction({ status: 'arrived', ...tow })).toMatchObject({ label: 'Start tow' })
    expect(driverNextAction({ status: 'in_progress', ...tow })).toMatchObject({ label: 'Complete job', hint: 'Tap once the vehicle is dropped off', confirm: true })
    for (const status of ['searching', 'completed', 'cancelled'] as BookingStatus[]) expect(driverNextAction({ status })).toBeNull()
  })

  it('cancel windows match the server', () => {
    expect([...CUSTOMER_CANCELLABLE]).toEqual(['pending', 'searching', 'accepted', 'en_route'])
    expect([...DRIVER_CANCELLABLE]).toEqual(['accepted', 'en_route', 'arrived'])
    expect(DRIVER_CANCEL_REASONS.map((reason) => reason.id).sort()).toEqual(['cannot_reach_customer', 'customer_asked', 'other', 'unsafe_location', 'vehicle_problem', 'wrong_service'])
    expect(CUSTOMER_CANCEL_REASONS.map((reason) => reason.id).sort()).toEqual(['found_other_help', 'no_longer_needed', 'other', 'wait_too_long', 'wrong_details'])
  })

  it('gives the customer a status line for every status', () => {
    const driver = { firstName: 'Marcus' }
    expect(customerStatusLine({ status: 'searching' })).toBe('Finding your driver')
    expect(customerStatusLine({ status: 'accepted', driver })).toBe('Marcus accepted your request')
    expect(customerStatusLine({ status: 'en_route', driver })).toBe('Marcus is on the way')
    expect(customerStatusLine({ status: 'arrived', driver })).toBe('Marcus has arrived')
    expect(customerStatusLine({ status: 'in_progress', driver })).toBe('Marcus is working on your vehicle')
    expect(customerStatusLine({ status: 'in_progress', driver, ...tow })).toBe('Marcus is towing your vehicle')
    expect(customerStatusLine({ status: 'completed' })).toBe('Service complete')
    expect(customerStatusLine({ status: 'cancelled' })).toBe('Request cancelled')
  })

  it('explains cancelling and why it is no longer possible', () => {
    expect(customerCancelText('searching')).toBe("We'll stop looking for a driver.")
    expect(customerCancelText('en_route', 'Marcus')).toMatch(/Marcus is already on the way/)
    expect(customerNoCancelText('en_route')).toBeNull()
    expect(customerNoCancelText('arrived', 'Marcus')).toMatch(/Marcus is here/)
    expect(customerNoCancelText('in_progress')).toMatch(/Service has started/)
  })
})
