/**
 * F6: screens and sheets that are not needed for the first paint load on demand (React.lazy).
 * A chunk can fail to load — a flaky connection, or (on the web) the app was updated and the old
 * file is gone. Try once more after a short pause; if it still fails, raise a ChunkLoadError so
 * ChunkBoundary can say “Update available — reload” instead of leaving a blank screen.
 */

import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

export class ChunkLoadError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Unable to load part of the app.')
    this.name = 'ChunkLoadError'
  }
}

const CHUNK_MESSAGE = /dynamically imported module|Importing a module script failed|Failed to fetch|Loading chunk|preload CSS/i

export function isChunkLoadError(error: unknown): boolean {
  return error instanceof ChunkLoadError || (error instanceof Error && (error.name === 'ChunkLoadError' || CHUNK_MESSAGE.test(error.message)))
}

export const RETRY_DELAY_MS = 600

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Run `load`, retry it once after RETRY_DELAY_MS, then give up with a ChunkLoadError. */
export async function loadWithRetry<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch {
    await wait(RETRY_DELAY_MS)
    try {
      return await load()
    } catch (error) {
      throw new ChunkLoadError(error)
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches React.lazy's own signature
export function lazyWithRetry<T extends ComponentType<any>>(load: () => Promise<{ default: T }>): LazyExoticComponent<T> {
  return lazy(() => loadWithRetry(load))
}
