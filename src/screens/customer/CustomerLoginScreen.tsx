import AuthPortal from '../../components/auth/AuthPortal'

interface CustomerLoginScreenProps {
  onLoginSuccess: () => void
  onSwitchToDriver: () => void
}

export default function CustomerLoginScreen({ onLoginSuccess, onSwitchToDriver }: CustomerLoginScreenProps) {
  return <AuthPortal role="customer" onLoginSuccess={onLoginSuccess} onSwitchRole={onSwitchToDriver} />
}
