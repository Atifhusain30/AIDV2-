/** Set a new password after opening the reset link (same look as sign-in). */

import { useId, useState, type FormEvent } from 'react'
import { AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import AidBrand from '../brand/AidBrand'
import Button from '../ui/Button'
import { managedAuth } from '../../auth/supabase'

export default function PasswordRecoveryScreen({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ids = { password: useId(), confirm: useId(), error: useId() }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setMessage(null)
    if (password !== confirmation) {
      setError('Passwords do not match.')
      return
    }
    setIsLoading(true)
    const result = await managedAuth.updatePassword(password)
    setIsLoading(false)
    if (!result.success) {
      setError(result.error || 'Unable to update your password.')
      return
    }
    setMessage(result.message || 'Your password has been updated.')
  }

  return (
    <main className="auth safe-top safe-bottom">
      <section className="auth__inner">
        <header className="auth__top"><AidBrand compact /></header>
        {message ? (
          <div className="auth__done">
            <span className="auth__done-icon auth__done-icon--ok" aria-hidden="true"><CheckCircle2 size={26} /></span>
            <h1>Password updated</h1>
            <p role="status">{message}</p>
            <Button block size="lg" onClick={onComplete}>Return to sign in</Button>
          </div>
        ) : (
          <>
            <div className="auth__intro">
              <h1>Choose a new password</h1>
              <p>Use at least 8 characters. You'll sign in with it next time.</p>
            </div>
            <form className="auth__form" onSubmit={handleSubmit}>
              <div className="ui-field">
                <label htmlFor={ids.password}>New password</label>
                <div className="auth__password">
                  <input id={ids.password} className="ui-input auth__input" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={8}
                    value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" aria-describedby={error ? ids.error : undefined} />
                  <button type="button" className="auth__reveal" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>
                    {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
                  </button>
                </div>
              </div>
              <div className="ui-field">
                <label htmlFor={ids.confirm}>Confirm password</label>
                <input id={ids.confirm} className="ui-input auth__input" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={8}
                  value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Repeat your password" aria-describedby={error ? ids.error : undefined} />
              </div>
              {error && <p id={ids.error} role="alert" className="ui-alert ui-alert--danger auth__message"><AlertCircle size={16} aria-hidden="true" /> <span>{error}</span></p>}
              <Button type="submit" block size="lg" loading={isLoading} loadingLabel="Updating…">Update password</Button>
            </form>
          </>
        )}
      </section>
    </main>
  )
}
