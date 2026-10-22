import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Call911Button, SafetyActions, SafetyMenuItem, SafetySheet } from './Safety'

afterEach(() => cleanup())

const sources = import.meta.glob(['../../**/*.{ts,tsx}', '!../../**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('no fake SOS / emergency dispatch (B19)', () => {
  it('scans real app source files', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20)
  })

  it.each([
    [/EmergencySOS/, 'fake SOS modal'],
    [/emergency_sos/, 'fake SOS modal id'],
    [/help is on the way/i, 'fake "help is on the way"'],
    [/connecting to 911/i, 'simulated 911 connection'],
    [/emergency contact has been notified/i, 'simulated emergency contact alert'],
    [/tow truck dispatched/i, 'simulated priority dispatch'],
    [/crash detect/i, 'crash detection claim'],
    [/share (your )?location with 911/i, 'location-to-911 claim'],
  ])('contains no %s (%s)', (pattern) => {
    const offenders = Object.entries(sources).filter(([, text]) => pattern.test(text)).map(([file]) => file)
    expect(offenders).toEqual([])
  })

  it('has exactly one tel:911 link in the app, inside the confirm step', () => {
    const files = Object.entries(sources).filter(([, text]) => /href=["'{`]*tel:911/.test(text)).map(([file]) => file)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/(^\.|components\/safety)\/Safety\.tsx$/)
    expect(sources[files[0]].match(/href=["'{`]*tel:911/g)).toHaveLength(1)
  })
})

describe('Call 911', () => {
  it('needs a confirmation tap before the tel:911 link appears', () => {
    render(<Call911Button />)
    expect(screen.queryByRole('link', { name: /911/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Call 911' }))
    const dialog = screen.getByRole('dialog', { name: 'Call 911?' })
    const link = within(dialog).getByRole('link', { name: 'Call 911 now' })
    expect(link.getAttribute('href')).toBe('tel:911')
    // The number is shown for devices (web/desktop) that can't place calls.
    expect(within(dialog).getByText(/dial/i).textContent).toMatch(/911/)
    expect(within(dialog).getByText(/does not contact 911/i)).toBeTruthy()
  })

  it('cancels without dialing', () => {
    render(<Call911Button />)
    fireEvent.click(screen.getByRole('button', { name: 'Call 911' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('link', { name: /911/ })).toBeNull()
  })
})

describe('safety sheet', () => {
  it('states plainly that AID does not contact emergency services and gives customer guidance', () => {
    render(<SafetySheet audience="customer" onClose={() => undefined} />)
    const dialog = screen.getByRole('dialog', { name: 'Safety' })
    expect(within(dialog).getByText(/AID is not an emergency service and does not contact 911/)).toBeTruthy()
    expect(within(dialog).getByText(/If you're in danger, call 911/)).toBeTruthy()
    expect(within(dialog).getByText(/away from traffic/)).toBeTruthy()
    expect(within(dialog).getByText(/hazard lights on/)).toBeTruthy()
    expect(within(dialog).getByText(/driver's name, vehicle and plate/)).toBeTruthy()
    // No share-trip feature exists, so the sheet must not promise one.
    expect(within(dialog).queryByText(/share/i)).toBeNull()
  })

  it('gives drivers their own guidance', () => {
    render(<SafetySheet audience="driver" onClose={() => undefined} />)
    expect(screen.getByText(/customer's name and vehicle/)).toBeTruthy()
  })

  it('reaches Call 911 through the same confirm step', () => {
    render(<SafetySheet audience="customer" onClose={() => undefined} />)
    expect(screen.queryByRole('link')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Call 911' }))
    expect(screen.getByRole('link', { name: 'Call 911 now' }).getAttribute('href')).toBe('tel:911')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('dialog', { name: 'Safety' })).toBeTruthy()
  })

  it('opens from the safety row and the settings menu item', () => {
    render(<SafetyActions audience="driver" />)
    fireEvent.click(screen.getByRole('button', { name: 'Safety' }))
    expect(screen.getByRole('dialog', { name: 'Safety' })).toBeTruthy()
    cleanup()
    render(<SafetyMenuItem audience="customer" />)
    fireEvent.click(screen.getByRole('button', { name: /Safety/ }))
    expect(screen.getByRole('dialog', { name: 'Safety' })).toBeTruthy()
  })
})
