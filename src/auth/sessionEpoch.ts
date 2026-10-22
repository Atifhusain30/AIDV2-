/**
 * E6: a counter that moves on every sign-out. An API answer that arrives after the person signed
 * out (the request started under an earlier epoch) is dropped, so it can never put the previous
 * person's data back on screen, and a late 401 from that old session can't trigger a second sign-out.
 */

export type SignOutRequest = 'user' | 'unauthorized'

let epoch = 0
let signOutHandler: ((reason: SignOutRequest) => void) | null = null

export function currentSessionEpoch(): number {
  return epoch
}

/** Called once by every sign-out (and when a different account replaces the session). */
export function advanceSessionEpoch(): void {
  epoch += 1
}

/** Installed by src/auth/signOut.ts (kept separate so the API client doesn't import every store). */
export function setSignOutHandler(handler: ((reason: SignOutRequest) => void) | null): void {
  signOutHandler = handler
}

/** The API answered 401 to a request made in `requestEpoch`: the session is no longer valid. */
export function reportUnauthorized(requestEpoch: number): void {
  if (requestEpoch !== epoch) return
  signOutHandler?.('unauthorized')
}

/** Ask for the full sign-out from code that can't import it directly. */
export function requestSignOut(): void {
  signOutHandler?.('user')
}
