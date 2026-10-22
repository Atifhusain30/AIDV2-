/**
 * F6: wraps a lazy-loaded screen or sheet. While its code loads it shows `fallback` (a Skeleton
 * shape, or nothing for sheets). If the code can't be loaded even after the retry in
 * lazyWithRetry, it says “Update available — reload” instead of a blank screen. Any other error
 * is passed on unchanged.
 */

import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import Button from './Button'
import { isChunkLoadError } from '../../lib/lazyWithRetry'

type Props = { children: ReactNode; fallback?: ReactNode }
type State = { error: Error | null }

export function UpdateAvailable({ onReload = () => window.location.reload() }: { onReload?: () => void }) {
  return (
    <div className="safe-top" style={{ padding: 16 }}>
      <div className="ui-empty ui-empty--compact" role="alert">
        <span className="ui-empty__icon" aria-hidden="true"><RefreshCw size={22} /></span>
        <h2>Update available — reload</h2>
        <p>Part of the app couldn't load. This usually means a newer version is ready or the connection dropped.</p>
        <Button size="sm" variant="secondary" icon={<RefreshCw size={16} aria-hidden="true" />} onClick={onReload}>Reload</Button>
      </div>
    </div>
  )
}

export default class ChunkBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkLoadError(error)) console.warn('[F6] Could not load part of the app:', error.message, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (error) {
      if (isChunkLoadError(error)) return <UpdateAvailable />
      throw error
    }
    return <Suspense fallback={this.props.fallback ?? null}>{this.props.children}</Suspense>
  }
}
