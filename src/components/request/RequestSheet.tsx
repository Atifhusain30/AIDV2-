/**
 * The request flow for every on-demand roadside service, as a short stepper
 * (Location → Details → Driver → Complete; the last two are the tracking screens).
 *
 * 1. Location: the map with the confirmed spot and a "Confirm your location" panel (Edit opens the
 *    address search; "Use current location" asks GPS — only on that tap). Only a real place with
 *    coordinates can be confirmed.
 * 2. Details: "Tell us more" — one service question where it helps (folded into the booking note,
 *    clearly labelled, since the server stores a free-text note), the vehicle from the garage, an
 *    optional note, and "Find a driver" with the server's price. Towing needs a real drop-off.
 *
 * From Home with a known location and vehicle it's three taps: the service, Confirm location,
 * Find a driver. Prices always come from the server catalog / quote.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { AlertCircle, ArrowRight, Battery, Car, Check, ChevronLeft, CircleDot, Droplets, Fuel, KeyRound, Loader2, LocateFixed, MapPin, Search, Truck, X, Zap } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { apiService, type PriceQuote, type ServiceOption } from '../../services/api'
import * as bookingService from '../../services/bookingService'
import locationService, { searchAddressSuggestions } from '../../services/locationService'
import type { ServiceType } from '../../types'
import { formatPrice } from '../../lib/money'
import { isJobOver } from '../../lib/jobLifecycle'
import Dialog from '../ui/Dialog'
import Button from '../ui/Button'
import FlowStepper from '../ui/FlowStepper'
import SegmentedControl from '../ui/SegmentedControl'
import VehicleCard from '../ui/VehicleCard'
import { InfoRow, ListRow } from '../ui/ListRow'
import { Skeleton, SkeletonRows } from '../ui/Skeleton'
import ChunkBoundary from '../ui/ChunkBoundary'
import { lazyWithRetry } from '../../lib/lazyWithRetry'

// Leaflet (the map) downloads only when the location step is shown (F6).
const MapPinPicker = lazyWithRetry(() => import('../ui/MapPinPicker'))

const ICONS: Partial<Record<ServiceType, typeof Battery>> = {
  battery_jump: Battery, flat_tire: CircleDot, towing: Truck, lockout: KeyRound,
  fuel_delivery: Fuel, ev_charging: Zap, oil_change: Droplets,
}

// Titles render immediately; prices and availability always come from the server catalog.
const TITLES: Partial<Record<ServiceType, string>> = {
  battery_jump: "Won't start", flat_tire: 'Flat tire', towing: 'Towing', lockout: 'Locked out',
  fuel_delivery: 'Fuel delivery', ev_charging: 'EV charging', oil_change: 'Oil change',
}

/**
 * One question per service where the answer changes what the driver brings. The server has no
 * field for these, so the answer is added to the start of the booking note as "Question: Answer".
 */
const QUESTIONS: Partial<Record<ServiceType, { key: string; label: string; note: string; options: string[] }>> = {
  flat_tire: { key: 'spare', label: 'Spare tire available?', note: 'Spare tire available', options: ['Yes', 'No'] },
  fuel_delivery: { key: 'fuel', label: 'Which fuel?', note: 'Fuel type', options: ['Regular', 'Diesel'] },
}

type Place = { address: string; lat: number; lng: number }
const STEP_LOCATION = 1
const STEP_DETAILS = 2

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
      <div className="ui-list">
        <InfoRow icon={<MapPin size={18} />} title={value.address} subtitle="Tow to"
          trailing={<button type="button" className="request-row__action" onClick={() => { onChange(null); setQuery('') }}>Change</button>} />
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
    userLocationLabel, userCoords, confirmLocation, setPendingReturnModal, setActiveModalPreserveStep,
    modalStep, setModalStep, vehicles, activeVehicleId, setActiveVehicle, setCurrentScreen, activeBooking, setActiveRequestRedirect,
  } = useAppStore()
  const isOpen = activeModal === 'services'
  // One active request at a time (E4): opening the flow with one in progress goes to that request.
  const hasActiveRequest = Boolean(activeBooking && !isJobOver(activeBooking.status))

  const [catalog, setCatalog] = useState<ServiceOption[] | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)
  // A pin moved on the map but not yet confirmed.
  const [pending, setPending] = useState<Place | null>(null)

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
  const questionId = useId()
  const loaded = useRef(false)

  const loadCatalog = useCallback(async () => {
    setCatalogError(null)
    const result = await apiService.listServices()
    if (result.success && result.data) setCatalog(result.data)
    else setCatalogError(result.error || 'Unable to load prices.')
  }, [])

  useEffect(() => {
    if (isOpen && !loaded.current) { loaded.current = true; void loadCatalog() }
    if (!isOpen) { setError(null); setSubmitting(false); setPending(null); setLocateError(null) }
  }, [isOpen, loadCatalog])

  const close = useCallback(() => {
    if (submitting) return
    setActiveModal(null)
    resetServiceFormData()
    setAnswers({})
  }, [resetServiceFormData, setActiveModal, submitting])

  // Each step swaps the content: move focus to the title so screen readers announce it.
  const stepKey = `${serviceFormData.selectedService ?? ''}:${modalStep}`
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

  const service = selected
  const options = catalog?.filter((item) => item.available) ?? []
  const vehicle = vehicles.find((item) => item.id === activeVehicleId) ?? vehicles[0]
  const place: Place | null = pending ?? (userLocationLabel && userCoords ? { address: userLocationLabel, lat: userCoords.lat, lng: userCoords.lng } : null)
  const hasLocation = Boolean(userLocationLabel && userCoords)
  const dropoff = serviceFormData.dropoff ?? null
  const needsDropoff = Boolean(service?.requiresDropoff && !dropoff)
  const distancePriced = Boolean(service?.requiresDropoff)
  const price = distancePriced ? quote?.price ?? null : service?.basePrice ?? null
  const rates = service?.pricing
  const rateText = rates ? `${formatPrice(rates.hookup)} includes the first ${rates.includedMiles} miles, then ${formatPrice(rates.perMile)} per mile.` : ''
  const question = service ? QUESTIONS[service.id] : undefined
  const step = !serviceFormData.selectedService ? 0 : modalStep >= STEP_DETAILS && hasLocation ? STEP_DETAILS : STEP_LOCATION

  const searchLocation = () => {
    setPendingReturnModal('services', STEP_LOCATION)
    setActiveModalPreserveStep('locationConfirm')
  }

  const useCurrentLocation = async () => {
    setLocating(true)
    setLocateError(null)
    try {
      const current = await locationService.getCurrentLocationSelection()
      setPending({ address: current.label, lat: current.coords.lat, lng: current.coords.lng })
    } catch (gpsError) {
      const message = gpsError instanceof Error ? gpsError.message : ''
      setLocateError(message.includes('denied') || message.includes('permission')
        ? 'Location permission is off. Turn on Location for AID in Settings, or search for your address.'
        : "Couldn't get your location. Search for your address instead.")
    } finally {
      setLocating(false)
    }
  }

  const movePin = async (coords: { lat: number; lng: number }) => {
    setPending({ address: 'Updating address…', ...coords })
    try {
      const label = await locationService.reverseGeocodeLabel(coords.lat, coords.lng)
      setPending({ address: label, ...coords })
    } catch {
      setPending({ address: place?.address && place.address !== 'Updating address…' ? place.address : 'Pinned location', ...coords })
    }
  }

  const confirmPlace = () => {
    if (!place || place.address === 'Updating address…') return
    confirmLocation(place.address, { lat: place.lat, lng: place.lng })
    setPending(null)
    setModalStep(STEP_DETAILS)
  }

  const noteWithAnswers = () => {
    const lines: string[] = []
    if (question && answers[question.key]) lines.push(`${question.note}: ${answers[question.key]}`)
    const typed = serviceFormData.problemDescription.trim()
    if (typed) lines.push(typed)
    return lines.join('\n').slice(0, 1000) || undefined
  }

  const submit = async () => {
    if (!service || !userCoords || !userLocationLabel) return
    setSubmitting(true)
    setError(null)
    try {
      const outcome = await bookingService.requestAndStartBooking({
        service,
        notes: noteWithAnswers(),
        locationLabel: userLocationLabel,
        locationCoords: { lat: userCoords.lat, lng: userCoords.lng },
        dropoffLocation: service.requiresDropoff && dropoff ? dropoff : undefined,
      })
      setActiveModal(null)
      resetServiceFormData()
      setAnswers({})
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
  const back = () => (step === STEP_DETAILS ? setModalStep(STEP_LOCATION) : close())

  // The one primary action per step, pinned at the bottom.
  let footer: JSX.Element | null = null
  if (catalog && service && step === STEP_LOCATION) {
    footer = (
      <Button size="lg" block disabled={!place || place.address === 'Updating address…' || locating} onClick={confirmPlace}>
        Confirm location <ArrowRight size={18} aria-hidden="true" />
      </Button>
    )
  } else if (catalog && service && step === STEP_DETAILS) {
    footer = (
      <>
        <Button size="lg" block disabled={submitting || needsDropoff || price === null} loading={submitting} loadingLabel="Finding a driver…" onClick={() => void submit()}>
          {price === null ? `Find a driver · from ${formatPrice(service.basePrice)}` : `Find a driver · ${formatPrice(price)}`}
        </Button>
        <p>
          {distancePriced
            ? quote?.distanceMiles != null ? `${quote.distanceMiles} mi tow · ${rateText}` : `Choose where the vehicle should be towed. ${rateText}`
            : `${formatPrice(service.basePrice)} estimated price.`}
          {' '}Free to cancel until your driver arrives.
        </p>
      </>
    )
  }

  return (
    <Dialog labelledBy={titleId} className="request-flow" backdropClassName="request-flow-backdrop" handle={false} dismissible={!submitting} onClose={close}>
      <header className="request-flow__header">
        <button type="button" className="request-flow__back" aria-label={step === STEP_DETAILS ? 'Back to location' : 'Close'} disabled={submitting} onClick={back}>
          {step === STEP_DETAILS ? <ChevronLeft size={22} aria-hidden="true" /> : <X size={20} aria-hidden="true" />}
        </button>
        <div className="request-flow__title">
          <h2 id={titleId} tabIndex={-1}>{title}</h2>
          <p>{step === 0 ? 'Choose the closest match. The price is set before you request.' : "We'll send a nearby verified driver"}</p>
        </div>
        <span aria-hidden="true" className="request-flow__spacer" />
      </header>
      {step > 0 && <div className="request-flow__stepper"><FlowStepper current={step - 1} /></div>}

      <div className="request-flow__body">
        {catalogError && (
          <div className="ui-alert ui-alert--danger request-error" role="alert">
            <AlertCircle size={16} aria-hidden="true" /> <span>{catalogError}</span>
            <button type="button" onClick={() => void loadCatalog()}>Try again</button>
          </div>
        )}
        {!catalog && !catalogError && <SkeletonRows count={serviceFormData.selectedService ? 3 : 5} label="Loading services and prices" />}

        {catalog && step === 0 && (
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
                      onClick={() => { setServiceFormData({ selectedService: option.id }); setModalStep(STEP_LOCATION) }} />
                  </li>
                )
              })}
            </ul>
          )
        )}

        {catalog && service && step === STEP_LOCATION && (
          <>
            <div className="request-map">
              {place ? (
                <ChunkBoundary fallback={<Skeleton height="100%" radius={0} width="100%" />}>
                  <MapPinPicker lat={place.lat} lng={place.lng} onChange={(coords) => void movePin(coords)} height="100%" />
                </ChunkBoundary>
              ) : (
                <div className="request-map__empty"><MapPin size={22} aria-hidden="true" /> <span>Add where you are to see it on the map</span></div>
              )}
              {/* Visual callout on the map; the same address is read once from the panel below. */}
              {place && <p className="request-map__callout" aria-hidden="true"><MapPin size={15} /> {place.address}</p>}
            </div>
            <section className="request-confirm" aria-labelledby={`${titleId}-confirm`}>
              <h3 id={`${titleId}-confirm`}>Confirm your location</h3>
              {place ? (
                <div className="request-confirm__address">
                  <span className="request-confirm__pin" aria-hidden="true"><MapPin size={18} /></span>
                  <span className="request-confirm__text">{place.address}</span>
                  <button type="button" className="request-confirm__edit" aria-label="Edit location" onClick={searchLocation}>Edit</button>
                </div>
              ) : (
                <button type="button" className="request-confirm__address request-confirm__address--empty" onClick={searchLocation}>
                  <span className="request-confirm__pin" aria-hidden="true"><Search size={18} /></span>
                  <span className="request-confirm__text">Search address</span>
                </button>
              )}
              <button type="button" className="request-confirm__gps" disabled={locating} onClick={() => void useCurrentLocation()}>
                {locating ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <LocateFixed size={18} aria-hidden="true" />}
                {locating ? 'Getting your location…' : 'Use current location'}
              </button>
              {place && <p className="request-confirm__hint">Drag the pin to your exact spot.</p>}
              {locateError && <p className="ui-alert ui-alert--danger" role="alert"><AlertCircle size={15} aria-hidden="true" /> {locateError}</p>}
            </section>
          </>
        )}

        {catalog && service && step === STEP_DETAILS && (
          <>
            <div className="request-details__intro">
              <h3>Tell us more</h3>
              <p>This helps the driver come prepared.</p>
            </div>

            {question && (
              <div className="request-card request-question">
                <span className="request-card__icon" aria-hidden="true"><ServiceIcon size={20} /></span>
                <div className="request-question__body">
                  <strong id={questionId}>{question.label}</strong>
                  <SegmentedControl labelledBy={questionId} value={answers[question.key] ?? null}
                    options={question.options.map((option) => ({ value: option, label: option }))}
                    onChange={(value) => setAnswers({ ...answers, [question.key]: value })} />
                </div>
              </div>
            )}

            {service.requiresDropoff && <DropoffSearch value={dropoff} onChange={(next) => setServiceFormData({ dropoff: next })} />}

            {vehicles.length > 1 ? (
              <fieldset className="request-vehicles">
                <legend id={`${titleId}-vehicle`}>Your vehicle</legend>
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
            ) : vehicle ? (
              <VehicleCard vehicle={vehicle} label="Your vehicle" />
            ) : (
              <div className="request-card request-card--muted">
                <span className="request-card__icon" aria-hidden="true"><Car size={20} /></span>
                <span><strong>Your vehicle</strong><small>None saved — optional. Add one in Garage to skip this next time.</small></span>
              </div>
            )}

            <div className="request-card request-note">
              <span className="request-card__icon" aria-hidden="true"><MapPin size={20} /></span>
              <label className="request-note__body" htmlFor={notesId}>
                <strong>Where are you exactly?</strong>
                <span className="sr-only">Note for the driver (optional)</span>
                <textarea id={notesId} rows={3} maxLength={900} placeholder="Add a note (optional), e.g. parked on the shoulder, hazard lights on"
                  value={serviceFormData.problemDescription} onChange={(event) => setServiceFormData({ problemDescription: event.target.value })} />
              </label>
            </div>

            {quoteError && <p className="ui-alert ui-alert--danger request-error" role="alert"><AlertCircle size={16} aria-hidden="true" /> {quoteError}</p>}
            {error && <p className="ui-alert ui-alert--danger request-error" role="alert"><AlertCircle size={16} aria-hidden="true" /> {error}</p>}
          </>
        )}
      </div>

      {footer && <div className="ui-sheet__footer request-flow__footer">{footer}</div>}
    </Dialog>
  )
}
