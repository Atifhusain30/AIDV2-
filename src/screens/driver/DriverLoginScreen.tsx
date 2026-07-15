import AuthPortal from '../../components/auth/AuthPortal'

interface DriverLoginScreenProps {
  onLoginSuccess: () => void
  onSwitchToCustomer: () => void
}

export default function DriverLoginScreen({ onLoginSuccess, onSwitchToCustomer }: DriverLoginScreenProps) {
  return <AuthPortal role="driver" onLoginSuccess={onLoginSuccess} onSwitchRole={onSwitchToCustomer} />
}
