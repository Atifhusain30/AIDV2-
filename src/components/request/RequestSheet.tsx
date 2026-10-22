/**
 * One request sheet for every on-demand roadside service (F1: Home → problem → Request).
 * Location comes from the customer's confirmed GPS/address, the vehicle from their garage (chosen
 * here when there's more than one), prices come from the server catalog (the price shown is the
 * price charged), and towing requires a drop-off chosen from real address search results.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { AlertCircle, Battery, Car, Check, CircleDot, Droplets, Fuel, KeyRound, Loader2, MapPin, Navigation, Search, Truck, Zap } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { apiService, type PriceQuote, type ServiceOption } from '../../services/api'
import * as bookingService from '../../services/bookingService'
import { searchAddressSuggestions } from '../../services/locationService'
import type { ServiceType } from '../../types'
import { formatPrice } from '../../lib/money'
import { isJobOver } from '../../lib/jobLifecycle'
import BottomSheet from '../ui/BottomSheet'
import Button from '../ui/Button'
import { InfoRow, ListRow } from '../ui/ListRow'
import { SkeletonRows } from '../ui/Skeleton'

const ICONS: Partial<Record<ServiceType, typeof Battery>> = {
  battery_jump: Battery, flat_tire: CircleDot, towing: Truck, lockout: KeyRound,
  fuel_delivery: Fuel, ev_charging: Zap, oil_change: Droplets,
}

// Titles render immediately; prices and availability always come from the server catalog.
const TITLES: Partial<Record<ServiceType, string>> = {
  battery_jump: "Won't start", flat_tire: 'Flat tire', towing: 'Towing', lockout: 'Locked out',
  fuel_delivery: 'Fuel delivery', ev_charging: 'EV charging', oil_change: 'Oil change',
}

type Place = { address: string; lat: number; lng: number }

function DropoffSearch({ value, onChange }: { value: Place | null; onChange: (place: Place | null) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const listId = useId()

  useEffect(() => {
    const text = query.trim()
    if (text.length < 3) { setResults([]); return }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setSearching(true)
      setError(null)
      try {
        const found = await searchAddressSuggestions(text, controller.signal)
        setResults(found.map((item) => ({ address: item.label, lat: item.lat, lng: item.lng })))
      } catch (searchError) {
        if (!controller.signal.aborted) setError('Address search is unavailable. Try again.')
        console.error('[RequestSheet] address search failed', searchError)
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, 300)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [query])

  if (value) {
    return (
      <InfoRow icon={<MapPin size={18} />} title={value.address} subtitle="Tow to"
        trailing={<button type="button" className="request-row__action" onClick={() => { onChange(null); setQuery('') }}>Change</button>} />
    )
  }

  return (
    <div className="request-search">
      <label htmlFor={inputId}>Tow to</label>
      <div className="request-search__field">
        <Search size={17} aria-hidden="true" />
        <input
          id={inputId}
          type="search"
          placeholder="Search a shop, dealership, or home address"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {searching && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
      </div>
      {error && <p className="ui-alert ui-alert--danger request-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</p>}
      {results.length > 0 && (
        <ul id={listId} role="listbox" className="request-search__results">
          {results.map((place) => (
            <li key={`${place.lat},${place.lng},${place.address}`} role="option" aria-selected="false" tabIndex={0}
              onClick={() => onChange(place)}
              onKeyDown={(event) => { if (event.key === 'Enter') onChange(place) }}>
              <MapPin size={15} aria-hidden="true" /> {place.address}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function RequestSheet() {
  const {
    activeModal, setActiveModal, serviceFormData, setServiceFormData, resetServiceFormData,
    userLocationLabel, userCoords, setPendingReturnModal, setActiveModalPreserveStep,
    vehicles, activeVehicleId, setActiveVehicle, setCurrentScreen, activeBooking, setActiveRequestRedirect,
  } = useAppStore()
  const isOpen = activeModal === 'services'
  // One active request at a time (E4): opening the sheet with one in progress goes to that request.
  const hasActiveRequest = Boolean(activeBooking && !isJobOver(activeBooking.status))

  const [catalog, setCatalog] = useState<ServiceOption[] | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    // (Not while submitting: the request just made becomes the active one, and submit navigates.)
    if (!isOpen || !hasActiveRequest || submitting) return
    setActiveModal(null)
    resetServiceFormData()
    setActiveRequestRedirect(true)
    setCurrentScreen('chat')
  }, [hasActiveRequest, isOpen, submitting, resetServiceFormData, setActiveModal, setActiveRequestRedirect, setCurrentScreen])
  const [error, setError] = useState<string | null>(null)
  const [quote, setQuote] = useState<PriceQuote | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const titleId = useId()
  const notesId = useId()
  const loaded = useRef(false)

  const loadCatalog = useCallback(async () => {
    setCatalogError(null)
    const result = await apiService.listServices()
    if (result.success && result.data) setCatalog(result.data)
    else setCatalogError(result.error || 'Unable to load prices.')
  }, [])

  useEffect(() => {
    if (isOpen && !loaded.current) { loaded.current = true; void loadCatalog() }
    if (!isOpen) { setError(null); setSubmitting(false) }
  }, [isOpen, loadCatalog])

  const close = useCallback(() => {
    if (submitting) return
    setActiveModal(null)
    resetServiceFormData()
  }, [resetServiceFormData, setActiveModal, submitting])

  // Choosing / changing the service swaps the sheet's content (the tapped button disappears):
  // move focus to the new title so screen readers announce the step and focus stays in the sheet.
  const stepKey = serviceFormData.selectedService ?? ''
  const firstStep = useRef(true)
  useEffect(() => {
    if (firstStep.current) { firstStep.current = false; return }
    document.getElementById(titleId)?.focus()
  }, [stepKey, titleId])

  // Distance-priced services (towing): ask the server for the exact price once both ends are known.
  const selected = catalog?.find((item) => item.id === serviceFormData.selectedService && item.available) ?? null
  const quoteDropoff = selected?.requiresDropoff ? serviceFormData.dropoff ?? null : null
  const quoteKey = isOpen && selected && quoteDropoff && userCoords && userLocationLabel
    ? JSON.stringify([selected.id, userLocationLabel, userCoords.lat, userCoords.lng, quoteDropoff])
    : null
  useEffect(() => {
    setQuote(null)
    setQuoteError(null)
    if (!quoteKey) return
    const [serviceType, address, lat, lng, dropoffLocation] = JSON.parse(quoteKey)
    let cancelled = false
    void apiService.quoteBooking({ serviceType, location: { address, lat, lng }, dropoffLocation }).then((result) => {
      if (cancelled) return
      if (result.success && result.data) setQuote(result.data)
      else setQuoteError(result.error || 'Unable to price this tow. Try again.')
    })
    return () => { cancelled = true }
  }, [quoteKey])

  if (!isOpen || hasActiveRequest) return null

  const service = catalog?.find((item) => item.id === serviceFormData.selectedService && item.available) ?? null
  const options = catalog?.filter((item) => item.available) ?? []
  const vehicle = vehicles.find((item) => item.id === activeVehicleId) ?? vehicles[0]
  const hasLocation = Boolean(userLocationLabel && userCoords)
  const dropoff = serviceFormData.dropoff ?? null
  const needsDropoff = Boolean(service?.requiresDropoff && !dropoff)
  const distancePriced = Boolean(service?.requiresDropoff)
  const price = distancePriced ? quote?.price ?? null : service?.basePrice ?? null
  const rates = service?.pricing
  const rateText = rates ? `${formatPrice(rates.hookup)} includes the first ${rates.includedMiles} miles, then ${formatPrice(rates.perMile)} per mile.` : ''

  const chooseLocation = () => {
    setPendingReturnModal('services', 1)
    setActiveModalPreserveStep('locationConfirm')
  }

  const submit = async () => {
    if (!service || !userCoords || !userLocationLabel) return
    setSubmitting(true)
    setError(null)
    try {
      const outcome = await bookingService.requestAndStartBooking({
        service,
        notes: serviceFormData.problemDescription.trim() || undefined,
        locationLabel: userLocationLabel,
        locationCoords: { lat: userCoords.lat, lng: userCoords.lng },
        dropoffLocation: service.requiresDropoff && dropoff ? dropoff : undefined,
      })
      setActiveModal(null)
      resetServiceFormData()
      // Already had one in progress (e.g. from another device): show that request, not an error.
      setActiveRequestRedirect(outcome.alreadyActive)
      setCurrentScreen('chat')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to request service. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const ServiceIcon = (service && ICONS[service.id]) || Car
  const title = service?.name ?? (serviceFormData.selectedService && TITLES[serviceFormData.selectedService]) ?? 'What happened?'
  const subtitle = serviceFormData.selectedService ? undefined : 'Choose the closest match. The price is set before you request.'

  const footer = catalog && service ? (
    <>
      {hasLocation ? (
        <Button size="lg" block disabled={submitting || needsDropoff || price === null} loading={submitting} loadingLabel="Requesting…" onClick={() => void submit()}>
          {price === null ? `Request · from ${formatPrice(service.basePrice)}` : `Request · ${formatPrice(price)}`}
        </Button>
      ) : (
        <Button size="lg" block icon={<Navigation size={18} aria-hidden="true" />} onClick={chooseLocation}>Set your location</Button>
      )}
      <p>
        {distancePriced
          ? quote?.distanceMiles != null ? `${quote.distanceMiles} mi tow · ${rateText}` : `Choose where the vehicle should be towed. ${rateText}`
          : `${formatPrice(service.basePrice)} flat price. You won't be charged until the job is done.`}
      </p>
    </>
  ) : undefined

  return (
    <BottomSheet titleId={titleId} title={title} subtitle={subtitle} className="request-sheet" dismissible={!submitting} onClose={close} footer={footer}>
      {catalogError && (
        <div className="ui-alert ui-alert--danger request-error" role="alert">
          <AlertCircle size={16} aria-hidden="true" /> <span>{catalogError}</span>
          <button type="button" onClick={() => void loadCatalog()}>Try again</button>
        </div>
      )}
      {!catalog && !catalogError && <SkeletonRows count={serviceFormData.selectedService ? 3 : 5} label="Loading services and prices" />}

      {catalog && !service && (
        options.length === 0 ? (
          <p className="ui-alert">No services are available right now. Please try again later.</p>
        ) : (
          <ul className="ui-list request-picker" aria-label="Services">
            {options.map((option) => {
              const Icon = ICONS[option.id] || Car
              return (
                <li key={option.id}>
                  <ListRow icon={<Icon size={20} />} title={option.name} subtitle={option.description}
                    trailing={<span className="request-picker__price">{option.requiresDropoff ? 'from ' : ''}{formatPrice(option.basePrice)}</span>}
                    onClick={() => setServiceFormData({ selectedService: option.id })} />
                </li>
              )
            })}
          </ul>
        )
      )}

      {catalog && service && (
        <>
          <div className="ui-list request-summary">
            <InfoRow icon={<ServiceIcon size={20} />} title={service.description || service.name} subtitle="Arrival time shows once a driver accepts"
              trailing={<button type="button" className="request-row__action" onClick={() => setServiceFormData({ selectedService: null })}>Change</button>} />
            <ListRow icon={<Navigation size={18} />} className={hasLocation ? '' : 'is-missing'}
              title={userLocationLabel || 'Add where you are'} subtitle={service.requiresDropoff ? 'Pick up at' : 'Help at'}
              ariaLabel={`${service.requiresDropoff ? 'Pick up at' : 'Help at'}: ${userLocationLabel || 'add where you are'}. Change location`} onClick={chooseLocation} />
            {vehicles.length <= 1 && (
              <InfoRow icon={<Car size={18} />} title={vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'No vehicle saved'}
                subtitle={vehicle ? 'Vehicle' : 'Optional — add one in Account to skip this next time'} />
            )}
          </div>

          {service.requiresDropoff && <DropoffSearch value={dropoff} onChange={(place) => setServiceFormData({ dropoff: place })} />}

          {vehicles.length > 1 && (
            <fieldset className="request-vehicles">
              <legend id={`${titleId}-vehicle`}>Vehicle</legend>
              <div role="radiogroup" aria-labelledby={`${titleId}-vehicle`}>
                {vehicles.map((item) => {
                  const checked = item.id === vehicle?.id
                  return (
                    <label key={item.id} className={`job-choice${checked ? ' is-selected' : ''}`}>
                      <input type="radio" name="request-vehicle" value={item.id} checked={checked} onChange={() => setActiveVehicle(item.id)} />
                      <span>{item.year} {item.make} {item.model}<small> · {item.plate}</small></span>
                      {checked && <Check size={16} aria-hidden="true" />}
                    </label>
                  )
                })}
              </div>
            </fieldset>
          )}

          <label className="request-notes" htmlFor={notesId}>
            <span>Anything the driver should know? (optional)</span>
            <textarea id={notesId} rows={2} maxLength={1000} placeholder="e.g. Parked on the shoulder, hazard lights on" value={serviceFormData.problemDescription}
              onChange={(event) => setServiceFormData({ problemDescription: event.target.value })} />
          </label>

          {quoteError && <p className="ui-alert ui-alert--danger request-error" role="alert"><AlertCircle size={16} aria-hidden="true" /> {quoteError}</p>}
          {error && <p className="ui-alert ui-alert--danger request-error" role="alert"><AlertCircle size={16} aria-hidden="true" /> {error}</p>}
        </>
      )}
    </BottomSheet>
  )
}
