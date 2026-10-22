import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ChunkBoundary from '../components/ui/ChunkBoundary'
import { ChunkLoadError, isChunkLoadError, lazyWithRetry, loadWithRetry } from './lazyWithRetry'

const Hello = () => <h1>Loaded screen</h1>
const failure = () => new TypeError('Failed to fetch dynamically imported module: /assets/Help-abc.js')

describe('F6 lazy loading: retry once, then “Update available — reload”', () => {
  it('a chunk that fails once loads on the retry', async () => {
    const load = vi.fn().mockRejectedValueOnce(failure()).mockResolvedValueOnce('ok')
    await expect(loadWithRetry(load)).resolves.toBe('ok')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('a chunk that fails twice gives up with a ChunkLoadError (only two attempts)', async () => {
    const load = vi.fn().mockRejectedValue(failure())
    await expect(loadWithRetry(load)).rejects.toBeInstanceOf(ChunkLoadError)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('recognises the browsers’ chunk-failure messages, not ordinary errors', () => {
    expect(isChunkLoadError(failure())).toBe(true)
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false)
  })

  it('shows the screen once loaded (after the retry)', async () => {
    const load = vi.fn().mockRejectedValueOnce(failure()).mockResolvedValueOnce({ default: Hello })
    const Lazy = lazyWithRetry(load)
    render(<ChunkBoundary fallback={<p>Loading…</p>}><Lazy /></ChunkBoundary>)
    expect(screen.getByText('Loading…')).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Loaded screen' })).toBeTruthy()
  })

  it('never leaves a blank screen: says “Update available — reload” with a Reload button', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const Lazy = lazyWithRetry(vi.fn().mockRejectedValue(failure()))
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } })
    render(<ChunkBoundary><Lazy /></ChunkBoundary>)
    expect(await screen.findByRole('heading', { name: 'Update available — reload' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledTimes(1)
    error.mockRestore()
    warn.mockRestore()
  })
})
