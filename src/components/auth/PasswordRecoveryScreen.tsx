import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, Loader2, LockKeyhole } from 'lucide-react'
import AidBrand from '../brand/AidBrand'
import { managedAuth } from '../../auth/supabase'

export default function PasswordRecoveryScreen({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
    <main className="auth-portal safe-top safe-bottom">
      <section className="auth-portal__content">
        <header className="auth-portal__header"><AidBrand compact label="ACCOUNT RECOVERY" /></header>
        <div className="auth-portal__intro"><p className="eyebrow">Secure your account</p><h1>Choose a new password.</h1><p>Use at least eight characters, then sign in with your new password.</p></div>
        {message ? (
          <div className="auth-form">
            <p role="status" className="auth-form__error">{message}</p>
            <button type="button" className="aid-primary-button" onClick={onComplete}>Return to sign in</button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label><span>New password</span><div className="auth-field"><LockKeyhole size={18} /><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /><button type="button" className="auth-field__reveal" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
            <label><span>Confirm password</span><div className="auth-field"><LockKeyhole size={18} /><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Repeat your password" /></div></label>
            {error && <p role="alert" className="auth-form__error">{error}</p>}
            <button type="submit" className="aid-primary-button" disabled={isLoading}>{isLoading ? <Loader2 size={20} className="animate-spin" /> : 'Update password'}</button>
          </form>
        )}
      </section>
    </main>
  )
}
