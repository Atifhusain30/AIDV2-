/**
 * Driver settings: who is signed in, documents and vehicle, help & safety, log out. Real data only.
 */

import { ChevronLeft, FileCheck2, LifeBuoy, LogOut, Truck } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { driverVehicleSummary } from '../../lib/driverVehicle'
import type { Driver } from '../../types'
import { SafetyMenuItem } from '../../components/safety/Safety'
import { List, ListRow } from '../../components/ui/ListRow'
import PersonAvatar from '../../components/ui/PersonAvatar'
import SectionHeader from '../../components/ui/SectionHeader'

export default function DriverSettingsScreen({ onBack, onOpenDocuments, onOpenVehicle, onOpenHelp, onLogout }: {
  onBack: () => void
  onOpenDocuments: () => void
  onOpenVehicle: () => void
  onOpenHelp: () => void
  onLogout: () => void
}) {
  const user = useAuthStore((state) => state.user) as Driver | null
  const name = user ? [user.firstName, user.lastName].filter(Boolean).join(' ') : ''

  return (
    <>
      <button type="button" className="ui-back" onClick={onBack}>
        <ChevronLeft size={22} aria-hidden="true" /> Back
      </button>
      <header className="ui-screen-title"><h1>Settings</h1></header>

      {user && (
        <section className="account-identity" aria-label="Signed in as">
          <div>
            <strong>{name || 'AID driver'}</strong>
            {user.email && <small>{user.email}</small>}
          </div>
          <PersonAvatar name={name} size="lg" />
        </section>
      )}

      <section className="ui-section" aria-labelledby="driver-settings-work">
        <SectionHeader id="driver-settings-work" title="Your work" />
        <List>
          <ListRow icon={<FileCheck2 size={19} />} title="Documents" subtitle="Verification and renewals" onClick={onOpenDocuments} />
          <ListRow icon={<Truck size={19} />} title="Vehicle & equipment"
            subtitle={driverVehicleSummary(user?.vehicle) || 'Add the vehicle customers look for'} onClick={onOpenVehicle} />
        </List>
      </section>

      <section className="ui-section" aria-labelledby="driver-settings-help">
        <SectionHeader id="driver-settings-help" title="Help & safety" />
        <List>
          <ListRow icon={<LifeBuoy size={19} />} title="Help & Support" subtitle="Report a problem, get answers" onClick={onOpenHelp} />
          <SafetyMenuItem audience="driver" />
        </List>
      </section>

      <section className="ui-section" aria-label="Sign out">
        <List>
          <ListRow icon={<LogOut size={19} />} title="Log out" chevron={false} onClick={onLogout} />
        </List>
      </section>
    </>
  )
}
