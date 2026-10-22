/**
 * E5: two-step sign-in for admins (password + a 6-digit code from an authenticator app, Supabase TOTP).
 * First sign-in: set up the app (QR code or setup key) and confirm one code. Every sign-in after that:
 * enter the code. The server refuses admin data until this step is done (code mfa_required).
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Check, Copy, KeyRound, LogOut, RotateCw, ShieldCheck } from 'lucide-react'
import { adminApi, type MfaState, type TotpEnrollment } from './api'
import type { AdminProfile } from './types'
import { Brand } from './ui'

const message = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.')
/** "ABCD EFGH …" — easier to read and type than one long string. */
const groupKey = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim()

function CodeField({ value, onChange, autoFocus }: { value: string; onChange: (value: string) => void; autoFocus?: boolean }) {
  return (
    <label className="field">
      6-digit code
      <input
        name="code"
        className="code-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={7}
        placeholder="123 456"
        aria-describedby="code-help"
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
      />
      <small id="code-help" className="field__help">From your authenticator app. It changes every 30 seconds.</small>
    </label>
  )
}

export default function TwoStep({ admin, state, onVerified, onSignOut }: {
  admin: AdminProfile
  state: Exclude<MfaState, { step: 'done' }>
  onVerified: () => void
  onSignOut: () => void
}) {
  const enrolling = state.step === 'enroll'
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const begin = useCallback(async () => {
    setSetupError(null)
    setEnrollment(null)
    try {
      setEnrollment(await adminApi.startEnrollment())
    } catch (startError) {
      setSetupError(message(startError))
    }
  }, [])

  useEffect(() => {
    if (enrolling) void begin()
  }, [enrolling, begin])

  const factorId = state.step === 'challenge' ? state.factorId : enrollment?.factorId

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const typed = String(new FormData(event.currentTarget).get('code') || code).replace(/\D/g, '')
    if (typed.length !== 6) {
      setError('Enter the 6-digit code from your authenticator app.')
      return
    }
    if (!factorId) return
    setBusy(true)
    setError(null)
    try {
      await adminApi.verifyCode(factorId, typed)
      onVerified()
    } catch (verifyError) {
      setError(message(verifyError))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  const copyKey = async () => {
    if (!enrollment) return
    try {
      await navigator.clipboard.writeText(enrollment.secret)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard blocked: the key is visible to type */ }
  }

  return (
    <main className="signin">
      <form noValidate onSubmit={(event) => void submit(event)} className={`signin__card${enrolling ? ' signin__card--wide' : ''}`} aria-labelledby="two-step-title">
        <Brand />
        <div className="two-step__head">
          <span className="two-step__icon" aria-hidden="true">{enrolling ? <ShieldCheck size={20} /> : <KeyRound size={20} />}</span>
          <div>
            <h1 id="two-step-title">{enrolling ? 'Set up two-step sign-in' : 'Enter your code'}</h1>
            <p className="muted">
              {enrolling
                ? 'Admin accounts need a code from an authenticator app every time they sign in.'
                : `Open your authenticator app and enter the code for AID Admin (${admin.email}).`}
            </p>
          </div>
        </div>

        {enrolling && (
          <ol className="two-step__steps">
            <li><span>1</span>Install an authenticator app on your phone — Google Authenticator, Microsoft Authenticator, 1Password or Authy.</li>
            <li><span>2</span>In the app, add an account and scan this QR code.</li>
            <li><span>3</span>Enter the 6-digit code the app shows.</li>
          </ol>
        )}

        {enrolling && (
          setupError ? (
            <div className="load-error two-step__error" role="alert">
              <div><strong>Couldn't start set-up</strong><p>{setupError}</p></div>
              <button type="button" className="btn btn--secondary" onClick={() => void begin()}><RotateCw size={15} aria-hidden="true" />Try again</button>
            </div>
          ) : enrollment ? (
            <div className="two-step__setup">
              <img className="two-step__qr" src={enrollment.qrCode} alt="QR code to add AID Admin to your authenticator app" width={168} height={168} />
              <div className="two-step__key">
                <span className="muted">Can't scan? Enter this setup key in the app instead:</span>
                <code aria-label="Setup key">{groupKey(enrollment.secret)}</code>
                <button type="button" className="btn btn--ghost two-step__copy" onClick={() => void copyKey()}>
                  {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{copied ? 'Copied' : 'Copy key'}
                </button>
              </div>
            </div>
          ) : (
            <div className="two-step__setup" role="status" aria-label="Preparing your QR code">
              <span className="skeleton two-step__qr" aria-hidden="true" />
              <span className="two-step__key"><span className="skeleton" style={{ width: '80%' }} /><span className="skeleton skeleton--sm" style={{ width: '60%' }} /></span>
            </div>
          )
        )}

        <CodeField value={code} onChange={setCode} autoFocus={!enrolling} />
        {error && <p role="alert" className="alert">{error}</p>}
        <button type="submit" className="btn btn--primary btn--block" disabled={busy || !factorId}>
          {busy ? 'Checking…' : enrolling ? 'Turn on two-step sign-in' : 'Verify and continue'}
        </button>

        <div className="two-step__foot">
          <p className="hint">
            {enrolling
              ? 'Keep this app on your phone. If you lose the phone, the AID owner can reset two-step sign-in for your account.'
              : 'Lost your phone or changed apps? Ask the AID owner to reset two-step sign-in for your account.'}
          </p>
          <button type="button" className="btn btn--ghost" onClick={onSignOut}><LogOut size={15} aria-hidden="true" />Sign out</button>
        </div>
      </form>
    </main>
  )
}
