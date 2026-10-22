import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeftRight,
  ArrowRight,
  Briefcase,
  Eye,
  EyeOff,
  LifeBuoy,
  Loader2,
  LockKeyhole,
  Mail,
  Phone,
  UserRound,
} from 'lucide-react'
import AidBrand from '../brand/AidBrand'
import { useAuthStore } from '../../store/useAuthStore'

type PortalRole = 'customer' | 'driver'

interface AuthPortalProps {
  role: PortalRole
  onLoginSuccess: () => void
  onSwitchRole: () => void
}

export default function AuthPortal({ role, onLoginSuccess, onSwitchRole }: AuthPortalProps) {
  const [isLogin, setIsLogin] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [recoveryMessage, setRecoveryMessage] = useState('')

  const {
    customerLogin,
    customerRegister,
    driverLogin,
    driverRegister,
    requestPasswordReset,

    isLoading,
    error,
    notice,
    clearError,
  } = useAuthStore()

  const isDriver = role === 'driver'

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    clearError()
    setRecoveryMessage('')

    const success = isDriver
      ? isLogin
        ? await driverLogin(email, password)
        : await driverRegister(email, password, firstName, lastName, phone)
      : isLogin
        ? await customerLogin(email, password)
        : await customerRegister(email, password, firstName, lastName, phone)

    if (success) onLoginSuccess()
  }

  const toggleMode = () => {
    clearError()
    setRecoveryMessage('')
    setIsLogin((current) => !current)
  }

  const handlePasswordRecovery = async () => {
    clearError()
    setRecoveryMessage('')
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setRecoveryMessage('Enter your email address first.')
      return
    }
    await requestPasswordReset(normalizedEmail)
  }

  return (
    <main className="auth-portal safe-top safe-bottom">
      <div className="auth-portal__ambient" aria-hidden="true">
        <div className="auth-route auth-route--one" />
        <div className="auth-route auth-route--two" />
        <div className="auth-beacon"><span /></div>
      </div>

      <motion.section
        className="auth-portal__content"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
      >
        <header className="auth-portal__header">
          <AidBrand compact label={isDriver ? 'FOR DRIVERS' : 'ROADSIDE'} />
          <div className={`auth-role-chip ${isDriver ? 'auth-role-chip--driver' : ''}`}>
            {isDriver ? <Briefcase size={14} /> : <LifeBuoy size={14} />}
            {isDriver ? 'Driver mode' : 'Customer mode'}
          </div>
        </header>

        <div className="auth-portal__intro">
          <p className="eyebrow">{isLogin ? 'Good to see you' : 'Create your AID account'}</p>
          <h1>{isDriver ? (isLogin ? 'Ready when you are.' : 'Earn on your schedule.') : (isLogin ? 'Welcome back' : 'Help is now one tap away.')}</h1>
          <p>
            {isDriver
              ? 'Manage requests, navigate to customers, and track every job from one calm workspace.'
              : 'Get back on the road with verified help, clear arrival times, and live service updates.'}
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <AnimatePresence initial={false}>
            {!isLogin && (
              <motion.div
                className="auth-form__registration"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <div className="auth-form__split">
                  <label>
                    <span>First name</span>
                    <div className="auth-field">
                      <UserRound size={18} />
                      <input value={firstName} onChange={(event) => setFirstName(event.target.value)} required={!isLogin} autoComplete="given-name" placeholder="Alex" />
                    </div>
                  </label>
                  <label>
                    <span>Last name</span>
                    <div className="auth-field">
                      <UserRound size={18} />
                      <input value={lastName} onChange={(event) => setLastName(event.target.value)} required={!isLogin} autoComplete="family-name" placeholder="Morgan" />
                    </div>
                  </label>
                </div>
                <label>
                  <span>Phone</span>
                  <div className="auth-field">
                    <Phone size={18} />
                    <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required={!isLogin} autoComplete="tel" placeholder="(555) 000-0000" />
                  </div>
                </label>
              </motion.div>
            )}
          </AnimatePresence>

          <label>
            <span>Email</span>
            <div className="auth-field">
              <Mail size={18} aria-hidden="true" />
              <input type="email" aria-invalid={error ? true : undefined} aria-describedby={error ? 'auth-form-message' : undefined} value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder={isDriver ? 'driver@email.com' : 'you@email.com'} />
            </div>
          </label>

          <label>
            <span>Password</span>
            <div className="auth-field">
              <LockKeyhole size={18} aria-hidden="true" />
              <input type={showPassword ? 'text' : 'password'} aria-invalid={error ? true : undefined} aria-describedby={error ? 'auth-form-message' : undefined} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete={isLogin ? 'current-password' : 'new-password'} placeholder="••••••••" />
              <button type="button" className="auth-field__reveal" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
          </label>

          {isLogin && (
            <button
              type="button"
              className="auth-form__forgot"
              onClick={() => void handlePasswordRecovery()}
            >
              Forgot password?
            </button>
          )}

          <AnimatePresence>
            {(error || notice || recoveryMessage) && (
              <motion.p id="auth-form-message" className="auth-form__error" role={error || recoveryMessage ? 'alert' : 'status'} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {error || notice || recoveryMessage}
              </motion.p>
            )}
          </AnimatePresence>

          <motion.button className="aid-primary-button" type="submit" disabled={isLoading} whileTap={{ scale: 0.985 }}>
            {isLoading ? <><Loader2 size={20} className="animate-spin" aria-hidden="true" /><span className="sr-only">{isLogin ? 'Signing in…' : 'Creating account…'}</span></> : <>{isLogin ? 'Sign in' : 'Create account'}<ArrowRight size={20} aria-hidden="true" /></>}
          </motion.button>
        </form>

        <div className="auth-portal__actions">
          <p>{isLogin ? 'New to AID?' : 'Already have an account?'} <button type="button" onClick={toggleMode}>{isLogin ? 'Create account' : 'Sign in'}</button></p>
          <button type="button" className="role-switch" onClick={onSwitchRole}>
            <ArrowLeftRight size={17} aria-hidden="true" />
            {isDriver ? 'I need roadside help' : 'Switch to driver mode'}
          </button>

        </div>
      </motion.section>
    </main>
  )
}
