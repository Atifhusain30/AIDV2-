/**
 * Sign in / create account for customers and drivers (managed auth). The first impression:
 * black canvas, the AID mark, one clear headline, tall labelled fields, one violet action. After
 * sign-up that needs email confirmation, a "Check your email" step replaces the form.
 */

import { useId, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, ArrowLeftRight, CheckCircle2, Eye, EyeOff, MailCheck } from 'lucide-react'
import AidBrand from '../brand/AidBrand'
import Button from '../ui/Button'
import { useAuthStore } from '../../store/useAuthStore'

type PortalRole = 'customer' | 'driver'

interface AuthPortalProps {
  role: PortalRole
  onLoginSuccess: () => void
  onSwitchRole: () => void
}

const COPY = {
  customer: {
    signIn: { title: 'Welcome back', text: 'Sign in to request help and follow your driver live.' },
    signUp: { title: 'Help is one tap away.', text: 'Create your account once. Next time, requesting help takes two taps.' },
    switchLabel: 'Switch to driver mode',
    email: 'you@email.com',
  },
  driver: {
    signIn: { title: 'Ready when you are.', text: 'Sign in to go online, take nearby jobs and manage every job.' },
    signUp: { title: 'Earn on your schedule.', text: 'Create your driver account, then upload your documents to get verified.' },
    switchLabel: 'I need roadside help',
    email: 'driver@email.com',
  },
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
  const ids = { first: useId(), last: useId(), phone: useId(), email: useId(), password: useId(), message: useId() }

  const { customerLogin, customerRegister, driverLogin, driverRegister, requestPasswordReset, isLoading, error, notice, clearError } = useAuthStore()

  const isDriver = role === 'driver'
  const copy = COPY[role]
  const heading = isLogin ? copy.signIn : copy.signUp
  // Sign-up that needs the email confirmed first: the server answered with a notice, not a session.
  const checkEmail = !isLogin && Boolean(notice) && !error

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

  const problem = error || recoveryMessage
  const describedBy = problem ? ids.message : undefined

  return (
    <main className="auth safe-top safe-bottom">
      <motion.section
        className="auth__inner"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* No role pill: the headline says which app this is, and the footer offers the switch. */}
        <header className="auth__top">
          <AidBrand compact label={isDriver ? 'Driver' : undefined} />
        </header>

        {checkEmail ? (
          <div className="auth__done" role="status">
            <span className="auth__done-icon" aria-hidden="true"><MailCheck size={26} /></span>
            <h1>Check your email</h1>
            <p>{notice}</p>
            <p className="auth__muted">We sent it to <strong>{email.trim()}</strong>. Open the link on this phone, then sign in.</p>
            <Button block size="lg" onClick={() => { clearError(); setIsLogin(true) }}>Back to sign in</Button>
          </div>
        ) : (
          <>
            <div className="auth__intro">
              <h1>{heading.title}</h1>
              <p>{heading.text}</p>
            </div>

            <form className="auth__form" onSubmit={handleSubmit}>
              <AnimatePresence initial={false}>
                {!isLogin && (
                  <motion.div
                    className="auth__register"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="auth__split">
                      <div className="ui-field">
                        <label htmlFor={ids.first}>First name</label>
                        <input id={ids.first} className="ui-input auth__input" value={firstName} onChange={(event) => setFirstName(event.target.value)} required={!isLogin} autoComplete="given-name" />
                      </div>
                      <div className="ui-field">
                        <label htmlFor={ids.last}>Last name</label>
                        <input id={ids.last} className="ui-input auth__input" value={lastName} onChange={(event) => setLastName(event.target.value)} required={!isLogin} autoComplete="family-name" />
                      </div>
                    </div>
                    <div className="ui-field">
                      <label htmlFor={ids.phone}>Phone</label>
                      <input id={ids.phone} className="ui-input auth__input" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required={!isLogin} autoComplete="tel" placeholder="(555) 000-0000" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="ui-field">
                <label htmlFor={ids.email}>Email</label>
                <input id={ids.email} className="ui-input auth__input" type="email" inputMode="email" autoCapitalize="none" spellCheck={false}
                  aria-invalid={error ? true : undefined} aria-describedby={describedBy}
                  value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder={copy.email} />
              </div>

              <div className="ui-field">
                {isLogin ? (
                  <div className="auth__label-row">
                    <label htmlFor={ids.password}>Password</label>
                    <button type="button" className="auth__link" onClick={() => void handlePasswordRecovery()}>Forgot password?</button>
                  </div>
                ) : <label htmlFor={ids.password}>Password</label>}
                <div className="auth__password">
                  <input id={ids.password} className="ui-input auth__input" type={showPassword ? 'text' : 'password'}
                    aria-invalid={error ? true : undefined} aria-describedby={describedBy}
                    value={password} onChange={(event) => setPassword(event.target.value)} required
                    autoComplete={isLogin ? 'current-password' : 'new-password'} placeholder={isLogin ? '' : 'At least 8 characters'} />
                  <button type="button" className="auth__reveal" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                    {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              {problem && (
                <p id={ids.message} className="ui-alert ui-alert--danger auth__message" role="alert"><AlertCircle size={16} aria-hidden="true" /> <span>{problem}</span></p>
              )}
              {!problem && notice && (
                <p id={ids.message} className="ui-alert auth__message auth__message--ok" role="status"><CheckCircle2 size={16} aria-hidden="true" /> <span>{notice}</span></p>
              )}

              <Button type="submit" block size="lg" loading={isLoading} loadingLabel={isLogin ? 'Signing in…' : 'Creating account…'}>
                {isLogin ? 'Sign in' : 'Create account'}
              </Button>
            </form>
          </>
        )}

        <footer className="auth__footer">
          {!checkEmail && (
            <p>{isLogin ? 'New to AID?' : 'Already have an account?'} <button type="button" className="auth__link" onClick={toggleMode}>{isLogin ? 'Create account' : 'Sign in'}</button></p>
          )}
          <button type="button" className="auth__switch" onClick={onSwitchRole}>
            <ArrowLeftRight size={16} aria-hidden="true" />
            {copy.switchLabel}
          </button>
        </footer>
      </motion.section>
    </main>
  )
}
