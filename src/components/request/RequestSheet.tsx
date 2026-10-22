/**
 * One request sheet for every on-demand roadside service.
 * Location comes from the customer's confirmed GPS/address, prices come from the
 * server catalog (the price shown is the price charged), and towing requires a
 * drop-off chosen from real address search results.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { AlertCircle, Battery, Car, ChevronRight, CircleDot, Droplets, Fuel, KeyRound, Loader2, MapPin, Navigation, Search, Truck, X, Zap } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { apiService, type PriceQuote, type ServiceOption } from '../../services/api'
import * as bookingService from '../../services/bookingService'
import { searchAddressSuggestions } from '../../services/locationService'
import type { ServiceType } from '../../types'
import { formatPrice } from '../../lib/money'

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
      <div className="request-row">
        <span className="request-row__icon"><MapPin size={18} aria-hidden="true" /></span>
        <span className="request-row__text"><small>TOW TO</small><strong>{value.address}</strong></span>
        <button type="button" className="request-row__action" onClick={() => { onChange(null); setQuery('') }}>Change</button>
      </div>
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
          aria-expanded={results.length > 0}
          aria-controls={listId}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {searching && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
      </div>
      {error && <p className="request-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</p>}
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
    vehicles, activeVehicleId, setCurrentScreen,
  } = useAppStore()
  const isOpen = activeModal === 'services'

  const [catalog, setCatalog] = useState<ServiceOption[] | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
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

  useEffect(() => {
    if (!isOpen) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, isOpen])

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

  if (!isOpen) return null

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
      await bookingService.requestAndStartBooking({
        service,
        notes: serviceFormData.problemDescription.trim() || undefined,
        locationLabel: userLocationLabel,
        locationCoords: { lat: userCoords.lat, lng: userCoords.lng },
        dropoffLocation: service.requiresDropoff && dropoff ? dropoff : undefined,
      })
      setActiveModal(null)
      resetServiceFormData()
      setCurrentScreen('chat')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to request service. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const ServiceIcon = (service && ICONS[service.id]) || Car

  return (
    <div className="account-sheet-backdrop" role="presentation" onMouseDown={close}>
      <section className="account-sheet request-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()}>
        <div className="account-sheet__handle" />
        <div className="account-sheet__header">
          <div>
            <small>{serviceFormData.selectedService ? 'REQUEST HELP' : 'WHAT HAPPENED?'}</small>
            <h2 id={titleId}>{service?.name ?? (serviceFormData.selectedService && TITLES[serviceFormData.selectedService]) ?? 'Choose a service'}</h2>
          </div>
          <button type="button" aria-label="Close" disabled={submitting} onClick={close}><X size={20} /></button>
        </div>

        {catalogError && (
          <div className="request-error" role="alert">
            <AlertCircle size={16} aria-hidden="true" /> <span>{catalogError}</span>
            <button type="button" onClick={() => void loadCatalog()}>Try again</button>
          </div>
        )}
        {!catalog && !catalogError && <div className="request-loading" role="status"><Loader2 size={20} className="animate-spin" aria-hidden="true" /> Loading prices…</div>}

        {catalog && !service && (
          <ul className="request-picker" aria-label="Services">
            {options.map((option) => {
              const Icon = ICONS[option.id] || Car
              return (
                <li key={option.id}>
                  <button type="button" onClick={() => setServiceFormData({ selectedService: option.id })}>
                    <span className="request-picker__icon"><Icon size={20} aria-hidden="true" /></span>
                    <span className="request-picker__text"><strong>{option.name}</strong><small>{option.description}</small></span>
                    <span className="request-picker__price">{option.requiresDropoff ? 'from ' : ''}{formatPrice(option.basePrice)}</span>
                    <ChevronRight size={17} aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {catalog && service && (
          <>
            <div className="request-summary">
              <span className="request-summary__icon"><ServiceIcon size={22} aria-hidden="true" /></span>
              <span className="request-summary__text"><strong>{service.description}</strong><small>Driver arrival time is shown once a driver accepts</small></span>
              <button type="button" className="request-row__action" onClick={() => setServiceFormData({ selectedService: null })}>Change</button>
            </div>

            <button type="button" className={`request-row${hasLocation ? '' : ' is-missing'}`} onClick={chooseLocation}>
              <span className="request-row__icon"><Navigation size={18} aria-hidden="true" /></span>
              <span className="request-row__text"><small>{service.requiresDropoff ? 'PICK UP AT' : 'HELP AT'}</small><strong>{userLocationLabel || 'Add where you are'}</strong></span>
              <ChevronRight size={17} aria-hidden="true" />
            </button>

            {service.requiresDropoff && <DropoffSearch value={dropoff} onChange={(place) => setServiceFormData({ dropoff: place })} />}

            <div className="request-row request-row--static">
              <span className="request-row__icon"><Car size={18} aria-hidden="true" /></span>
              <span className="request-row__text"><small>VEHICLE</small><strong>{vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'No vehicle saved'}</strong></span>
            </div>

            <label className="request-notes" htmlFor={notesId}>
              <span>Anything the driver should know? (optional)</span>
              <textarea id={notesId} rows={2} maxLength={1000} placeholder="e.g. Parked on the shoulder, hazard lights on" value={serviceFormData.problemDescription}
                onChange={(event) => setServiceFormData({ problemDescription: event.target.value })} />
            </label>

            {quoteError && <p className="request-error" role="alert"><AlertCircle size={16} aria-hidden="true" /> {quoteError}</p>}
            {error && <p className="request-error" role="alert"><AlertCircle size={16} aria-hidden="true" /> {error}</p>}

            <div className="request-footer">
              {hasLocation ? (
                <button type="button" className="aid-primary-button" disabled={submitting || needsDropoff || price === null} onClick={() => void submit()}>
                  {submitting ? 'Requesting…' : price === null ? `Request · from ${formatPrice(service.basePrice)}` : `Request · ${formatPrice(price)}`}
                </button>
              ) : (
                <button type="button" className="aid-primary-button" onClick={chooseLocation}>Set your location</button>
              )}
              <p>
                {distancePriced
                  ? quote?.distanceMiles != null ? `${quote.distanceMiles} mi tow · ${rateText}` : `Choose where the vehicle should be towed. ${rateText}`
                  : `${formatPrice(service.basePrice)} flat price. You won't be charged until the job is done.`}
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
