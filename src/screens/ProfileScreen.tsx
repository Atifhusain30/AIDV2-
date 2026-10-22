/**
 * Customer Account: who you are, your garage (the saved vehicle makes the next request two taps),
 * help & safety, contact details, sign out and account deletion. Only real data — nothing is
 * invented when a field is empty. F5: the garage shows a skeleton while loading, an error with
 * Try again, and an honest empty state.
 */

import { useState } from 'react'
import { AlertCircle, LifeBuoy, LogOut, MapPin, Settings, Trash2 } from 'lucide-react'
import AidBrand from '../components/brand/AidBrand'
import { useAppStore } from '../store/useAppStore'
import { useAuthStore } from '../store/useAuthStore'
import { apiService } from '../services/api'
import { signOut } from '../auth/signOut'
import { SafetyMenuItem } from '../components/safety/Safety'
import { AddVehicleSheet, GarageList, useGarage } from '../components/garage/Garage'
import BottomSheet from '../components/ui/BottomSheet'
import Button from '../components/ui/Button'
import { List, ListRow } from '../components/ui/ListRow'
import PersonAvatar from '../components/ui/PersonAvatar'
import SectionHeader from '../components/ui/SectionHeader'
import { SkeletonRows } from '../components/ui/Skeleton'
import ChunkBoundary from '../components/ui/ChunkBoundary'
import { lazyWithRetry } from '../lib/lazyWithRetry'

// F6: Help & Support downloads only when it's opened.
const HelpSupportScreen = lazyWithRetry(() => import('./HelpSupportScreen'))

export default function ProfileScreen() {
  const { user: profile, setActiveModal, setCurrentScreen } = useAppStore()
  const { user: authUser, isAuthenticated } = useAuthStore()
  const garage = useGarage()
  const [showVehicleForm, setShowVehicleForm] = useState(false)
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const name = profile?.name || (authUser ? `${authUser.firstName} ${authUser.lastName}`.trim() : '')
  const email = profile?.email || authUser?.email
  const phone = profile?.phone || authUser?.phone

  const saveVehicle = async (input: { make: string; model: string; year: number; color: string; plate: string }) => {
    const failure = await garage.save(input)
    if (!failure) setShowVehicleForm(false)
    return failure
  }

  // E6: the one full sign-out (src/auth/signOut.ts).
  const handleLogout = () => { void signOut('user') }

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true)
    setDeleteError(null)
    const result = await apiService.deleteAccount()
    setIsDeletingAccount(false)
    if (!result.success) {
      setDeleteError(result.error || 'Unable to delete your account. Please try again.')
      return
    }
    setShowDeleteConfirmation(false)
    // E6: the account is gone on the server; remove everything of it from this phone too.
    void signOut('deleted')
  }

  if (showHelp) return <ChunkBoundary fallback={<SkeletonRows count={4} />}><HelpSupportScreen audience="customer" onBack={() => setShowHelp(false)} /></ChunkBoundary>

  return (
    <div className="ui-screen account-screen">
      {/* Owner reference: the AID logo and a settings gear; the page name is for screen readers. */}
      <header className="account-top">
        <AidBrand compact />
        <h1 className="sr-only">Account</h1>
        <button type="button" className="ui-icon-btn" aria-label="Settings" aria-haspopup="dialog" onClick={() => setShowSettings(true)}>
          <Settings size={20} aria-hidden="true" />
        </button>
      </header>

      <section className="account-identity" aria-label="Account profile">
        <PersonAvatar name={name} size="lg" />
        <div>
          <strong>{name || 'Guest account'}</strong>
          {!email && !phone && <small>Your roadside settings are saved on this device</small>}
          {email && <small>{email}</small>}
          {phone && <small>{phone}</small>}
        </div>
      </section>

      <section className="ui-section" aria-labelledby="account-garage-title">
        {/* Summary here; editing (remove) lives on the Garage tab. */}
        <SectionHeader id="account-garage-title" title="Your garage"
          action={garage.vehicles.length > 0 ? { label: 'Edit', ariaLabel: 'Edit garage', onClick: () => setCurrentScreen('garage') } : undefined} />
        <GarageList garage={garage} onAdd={() => setShowVehicleForm(true)} />
      </section>

      {/* No "Payment methods" row: card payments aren't live, and AID never shows a fake card. */}
      <section className="ui-section" aria-label="Help, safety and settings">
        <List>
          <ListRow icon={<LifeBuoy size={19} />} title="Help & support" subtitle="Report a problem, get answers" onClick={() => setShowHelp(true)} />
          <SafetyMenuItem audience="customer" />
          <ListRow icon={<Settings size={19} />} title="Settings" subtitle={isAuthenticated ? 'Location, delete account' : 'Location'} hasPopup onClick={() => setShowSettings(true)} />
        </List>
      </section>

      {isAuthenticated && (
        <section className="ui-section" aria-label="Sign out">
          <List>
            <ListRow icon={<LogOut size={19} />} title="Sign out" tone="danger" chevron={false} onClick={handleLogout} />
          </List>
        </section>
      )}
      <p className="account-version">AID Roadside · Version 1.0</p>

      {showSettings && (
        <BottomSheet title="Settings" closeLabel="Close settings" onClose={() => setShowSettings(false)}>
          <List>
            <ListRow icon={<MapPin size={19} />} title="Location" subtitle="Where help should arrive" hasPopup onClick={() => { setShowSettings(false); setActiveModal('locationConfirm') }} />
            {isAuthenticated && (
              <ListRow icon={<Trash2 size={19} />} title="Delete account" tone="danger" chevron={false} hasPopup onClick={() => { setShowSettings(false); setShowDeleteConfirmation(true) }} />
            )}
          </List>
        </BottomSheet>
      )}

      {showVehicleForm && <AddVehicleSheet onClose={() => setShowVehicleForm(false)} onSave={saveVehicle} />}
      {showDeleteConfirmation && (
        <BottomSheet title="Permanently delete account?" titleId="delete-account-title" describedBy="delete-account-text" role="alertdialog" showClose={false}
          dismissible={!isDeletingAccount} onClose={() => setShowDeleteConfirmation(false)}
          footer={(
            <>
              {deleteError && <p role="alert" className="ui-alert ui-alert--danger"><AlertCircle size={16} aria-hidden="true" /> {deleteError}</p>}
              <Button variant="destructive" block size="lg" loading={isDeletingAccount} loadingLabel="Deleting account…" onClick={() => void handleDeleteAccount()}>Delete my account permanently</Button>
              <Button variant="secondary" block disabled={isDeletingAccount} onClick={() => setShowDeleteConfirmation(false)}>Keep my account</Button>
            </>
          )}>
          <p id="delete-account-text" className="sheet-text">This removes your account, saved vehicles, active requests, driver documents and marketplace history. This cannot be undone.</p>
        </BottomSheet>
      )}
    </div>
  )
}
