import { describe, expect, it, vi } from 'vitest'
import { createLocationSharer, SHARE_STATUSES } from './jobLocationSharing'

function harness(now = { t: 0 }) {
  let emit: (location: { lat: number; lng: number }) => void = () => {}
  let fail: (error: Error) => void = () => {}
  const upload = vi.fn().mockResolvedValue({ success: true })
  const watch = vi.fn(async (onLocation: typeof emit, onError: typeof fail) => { emit = onLocation; fail = onError; return 'watch-1' })
  const stopWatch = vi.fn().mockResolvedValue(undefined)
  const onStatus = vi.fn()
  const onLocation = vi.fn()
  const sharer = createLocationSharer({ upload, watch, stopWatch, onStatus, onLocation, now: () => now.t })
  return { sharer, upload, watch, stopWatch, onStatus, onLocation, now, emit: (l: { lat: number; lng: number }) => emit(l), fail: (e: Error) => fail(e) }
}

describe('job location sharing', () => {
  it('shares only while the driver is on an active job', () => {
    expect([...SHARE_STATUSES]).toEqual(['accepted', 'en_route', 'arrived', 'in_progress'])
  })

  it('uploads the first fix immediately, then at most every 5 seconds', async () => {
    const h = harness()
    await h.sharer.start('booking-1')
    expect(h.onStatus).toHaveBeenLastCalledWith('starting')
    h.emit({ lat: 33, lng: -97 })
    expect(h.upload).toHaveBeenCalledTimes(1)
    expect(h.upload).toHaveBeenLastCalledWith('booking-1', { lat: 33, lng: -97 })
    expect(h.onStatus).toHaveBeenLastCalledWith('sharing')
    expect(h.onLocation).toHaveBeenLastCalledWith({ lat: 33, lng: -97 })

    h.now.t = 2000; h.emit({ lat: 33.01, lng: -97 })
    expect(h.upload).toHaveBeenCalledTimes(1)
    h.now.t = 5100; h.emit({ lat: 33.02, lng: -97 })
    expect(h.upload).toHaveBeenCalledTimes(2)
  })

  it('skips uploads when parked, but still sends a heartbeat every 30 seconds', async () => {
    const h = harness()
    await h.sharer.start('booking-1')
    h.emit({ lat: 33, lng: -97 })
    h.now.t = 10000; h.emit({ lat: 33.00001, lng: -97 })
    expect(h.upload).toHaveBeenCalledTimes(1)
    h.now.t = 31000; h.emit({ lat: 33.00001, lng: -97 })
    expect(h.upload).toHaveBeenCalledTimes(2)
  })

  it('stops watching GPS when the job ends', async () => {
    const h = harness()
    await h.sharer.start('booking-1')
    await h.sharer.stop()
    expect(h.stopWatch).toHaveBeenCalledWith('watch-1')
    expect(h.onStatus).toHaveBeenLastCalledWith('off')
    h.emit({ lat: 33, lng: -97 })
    expect(h.upload).not.toHaveBeenCalled()
  })

  it('switching jobs restarts sharing for the new job only', async () => {
    const h = harness()
    await h.sharer.start('booking-1')
    await h.sharer.start('booking-1')
    expect(h.watch).toHaveBeenCalledTimes(1)
    await h.sharer.start('booking-2')
    expect(h.stopWatch).toHaveBeenCalledTimes(1)
    h.emit({ lat: 33, lng: -97 })
    expect(h.upload).toHaveBeenLastCalledWith('booking-2', { lat: 33, lng: -97 })
  })

  it('reports when location permission is denied', async () => {
    const h = harness()
    h.watch.mockRejectedValueOnce(Object.assign(new Error('Location permission was denied'), { code: 'OS-PLUG-GLOC-0003' }))
    await h.sharer.start('booking-1')
    expect(h.onStatus).toHaveBeenLastCalledWith('denied')
  })

  it('reports GPS errors without stopping', async () => {
    const h = harness()
    await h.sharer.start('booking-1')
    h.fail(new Error('timeout'))
    expect(h.onStatus).toHaveBeenLastCalledWith('error')
    h.emit({ lat: 33, lng: -97 })
    expect(h.onStatus).toHaveBeenLastCalledWith('sharing')
  })

  it('reports when the server rejects an upload', async () => {
    const h = harness()
    h.upload.mockResolvedValueOnce({ success: false, error: 'Active booking not found' })
    await h.sharer.start('booking-1')
    h.emit({ lat: 33, lng: -97 })
    await vi.waitFor(() => expect(h.onStatus).toHaveBeenLastCalledWith('error'))
  })
})
