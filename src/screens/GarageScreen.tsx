/**
 * Garage tab: the customer's saved vehicles. The default one fills in every request automatically
 * (tap a vehicle to make it the default); Edit shows Remove; Add vehicle opens the form sheet.
 */

import { useEffect, useState } from 'react'
import SectionHeader from '../components/ui/SectionHeader'
import { AddVehicleSheet, GarageList, useGarage } from '../components/garage/Garage'

export default function GarageScreen() {
  const garage = useGarage()
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  // Leave edit mode once the last vehicle is gone.
  useEffect(() => { if (garage.vehicles.length === 0) setEditing(false) }, [garage.vehicles.length])

  return (
    <div className="ui-screen garage-screen">
      <header className="ui-screen-title">
        <h1>Garage</h1>
        <p>Your default vehicle is filled in when you request help.</p>
      </header>
      <section className="ui-section garage-screen__list" aria-labelledby="garage-vehicles-title">
        <SectionHeader id="garage-vehicles-title" title="Your vehicles"
          action={garage.vehicles.length > 0 ? { label: editing ? 'Done' : 'Edit', ariaLabel: editing ? 'Done editing garage' : 'Edit garage', onClick: () => setEditing((value) => !value) } : undefined} />
        <GarageList garage={garage} editing={editing} onAdd={() => setAdding(true)} />
      </section>
      {adding && (
        <AddVehicleSheet onClose={() => setAdding(false)} onSave={async (input) => {
          const failure = await garage.save(input)
          if (!failure) setAdding(false)
          return failure
        }} />
      )}
    </div>
  )
}
