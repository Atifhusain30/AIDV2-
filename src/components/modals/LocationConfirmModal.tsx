/**
 * "Where do you need help?" — the location sheet (F1: same bottom sheet as every other one).
 * Only a real place can be confirmed: GPS, an address picked from search results, or a moved pin.
 * Typed text alone has no coordinates, so Confirm stays off until one of those is chosen.
 */

import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react'
import { MapPin, Navigation, ExternalLink, Loader2, AlertCircle, Check, Info, Search, Move } from 'lucide-react'
import { useAppStore, GeoCoords } from '../../store/useAppStore'
import locationService, { AddressSuggestion } from '../../services/locationService'
import BottomSheet from '../ui/BottomSheet'
import Button from '../ui/Button'
import { ListRow } from '../ui/ListRow'
import { Skeleton } from '../ui/Skeleton'

// Lazy load MapPinPicker to avoid SSR issues with Leaflet
const MapPinPicker = lazy(() => import('../ui/MapPinPicker'))

const LOOKING_UP = 'Looking up address...'
const UPDATING = 'Updating address...'

export default function LocationConfirmModal() {
  const {
    activeModal,
    setActiveModal,
    setActiveModalPreserveStep,
    confirmLocation,
    userLocationLabel,
    userCoords,
    pendingReturnModal,
    pendingReturnModalStep,
    setPendingReturnModal,
    setModalStep,
  } = useAppStore()

  const [selectedLabel, setSelectedLabel] = useState<string>('')
  const [selectedCoords, setSelectedCoords] = useState<GeoCoords | null>(null)
  const [manualQuery, setManualQuery] = useState<string>('')
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [isLoadingGPS, setIsLoadingGPS] = useState(false)
  const [isResolvingAddress, setIsResolvingAddress] = useState(false)
  const [isUpdatingPin, setIsUpdatingPin] = useState(false)
  const [addressWarning, setAddressWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const searchAbortRef = useRef<AbortController | null>(null)
  const isOpen = activeModal === 'locationConfirm'

  // Start from the confirmed location, if there is one.
  const handleOpen = useCallback(() => {
    if (userLocationLabel) {
      setSelectedLabel(userLocationLabel)
      setSelectedCoords(userCoords)
      setManualQuery(userLocationLabel)
    } else {
      setSelectedLabel('')
      setSelectedCoords(null)
      setManualQuery('')
    }
    setSuggestions([])
    setIsSearching(false)
    setSearchError(null)
    setError(null)
    setAddressWarning(null)
    setIsResolvingAddress(false)
  }, [userLocationLabel, userCoords])

  // Debounced address search
  useEffect(() => {
    const query = manualQuery.trim()
    if (query.length < 3 || (selectedCoords && query === selectedLabel)) {
      setSuggestions([])
      setSearchError(null)
      return
    }
    const timeoutId = setTimeout(async () => {
      try {
        setIsSearching(true)
        setSearchError(null)
        searchAbortRef.current?.abort()
        searchAbortRef.current = new AbortController()
        const results = await locationService.searchAddressSuggestions(query, searchAbortRef.current.signal)
        setSuggestions(results)
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        console.error('[LocationConfirmModal] Search error:', err)
        setSearchError('Address search is unavailable right now. Try again or use your current location.')
        setSuggestions([])
      } finally {
        setIsSearching(false)
      }
    }, 400)
    return () => clearTimeout(timeoutId)
  }, [manualQuery, selectedCoords, selectedLabel])

  const handleUseCurrentLocation = async () => {
    if (isLoadingGPS || isResolvingAddress) return
    setIsLoadingGPS(true)
    setError(null)
    setAddressWarning(null)
    setSuggestions([])
    setSearchError(null)
    try {
      const current = await locationService.getCurrentLocationSelection()
      setSelectedCoords(current.coords)
      setIsLoadingGPS(false)
      setIsResolvingAddress(true)
      setSelectedLabel(LOOKING_UP)
      try {
        const label = current.label
        setSelectedLabel(label)
        setManualQuery(label)
        setAddressWarning(null)
      } catch (geocodeErr) {
        console.warn('[LocationConfirmModal] Reverse geocoding failed:', geocodeErr)
        setSelectedLabel('Current location (GPS)')
        setManualQuery('Current location (GPS)')
        setAddressWarning("Couldn't fetch the address — you can still confirm with your GPS position.")
      }
    } catch (err) {
      console.error('[LocationConfirmModal] GPS error:', err)
      const message = err instanceof Error ? err.message : ''
      if (message.includes('denied') || message.includes('permission')) {
        setError('Location permission is off. Turn on Location for AID in Settings, or search for your address.')
      } else if (message.includes('timeout')) {
        setError('Finding your location took too long. Try again or search for your address.')
      } else {
        setError("Couldn't get your location. Search for your address instead.")
      }
    } finally {
      setIsLoadingGPS(false)
      setIsResolvingAddress(false)
    }
  }

  // Typing clears the coordinates: only a picked suggestion, GPS or the pin is a real place.
  const handleManualQueryChange = (value: string) => {
    setManualQuery(value)
    setSelectedCoords(null)
    setSelectedLabel(value.trim())
    setAddressWarning(null)
  }

  const handleSelectSuggestion = (suggestion: AddressSuggestion) => {
    setSelectedLabel(suggestion.label)
    setSelectedCoords({ lat: suggestion.lat, lng: suggestion.lng })
    setManualQuery(suggestion.label)
    setSuggestions([])
    setSearchError(null)
    setAddressWarning(null)
  }

  const handlePinMove = async (newCoords: { lat: number; lng: number }) => {
    setSelectedCoords({ lat: newCoords.lat, lng: newCoords.lng })
    setIsUpdatingPin(true)
    setAddressWarning(null)
    const previousLabel = selectedLabel
    setSelectedLabel(UPDATING)
    try {
      const label = await locationService.reverseGeocodeLabel(newCoords.lat, newCoords.lng)
      setSelectedLabel(label)
      setManualQuery(label)
    } catch (err) {
      console.warn('[LocationConfirmModal] Pin move geocode failed:', err)
      const fallbackLabel = previousLabel && previousLabel !== UPDATING ? previousLabel : 'Pinned location'
      setSelectedLabel(fallbackLabel)
      setManualQuery(fallbackLabel)
      setAddressWarning("Couldn't update the address — the pin's position is saved.")
    } finally {
      setIsUpdatingPin(false)
    }
  }

  const returnToOpener = () => {
    if (pendingReturnModal) {
      setModalStep(pendingReturnModalStep)
      setActiveModalPreserveStep(pendingReturnModal)
      setPendingReturnModal(null)
    } else {
      setActiveModal(null)
    }
  }

  const handleConfirm = () => {
    const finalLabel = selectedLabel.trim() || manualQuery.trim()
    try {
      const resolved = locationService.requireResolvedLocation(finalLabel, selectedCoords)
      confirmLocation(resolved.label, resolved.coords)
    } catch (locationError) {
      setError(locationError instanceof Error ? locationError.message : 'Select a valid location.')
      return
    }
    returnToOpener()
  }

  const busy = isLoadingGPS || isResolvingAddress || isUpdatingPin
  const canConfirm = Boolean((selectedLabel.trim() || manualQuery.trim()) && selectedCoords) && !busy
    && selectedLabel !== LOOKING_UP && selectedLabel !== UPDATING

  if (isOpen && selectedLabel === '' && userLocationLabel) handleOpen()
  if (!isOpen) return null

  const showSelected = selectedCoords && selectedLabel && selectedLabel !== LOOKING_UP && selectedLabel !== UPDATING

  return (
    <BottomSheet title="Where do you need help?" titleId="location-confirm-title" className="location-sheet" onClose={returnToOpener}
      footer={<Button size="lg" block disabled={!canConfirm} onClick={handleConfirm}>{isResolvingAddress || isUpdatingPin ? 'Updating…' : 'Confirm location'}</Button>}>
      {error && <p className="ui-alert ui-alert--danger" role="alert"><AlertCircle size={16} aria-hidden="true" /> {error}</p>}

      <div className="ui-list">
        <ListRow tone="brand" icon={isLoadingGPS || isResolvingAddress ? <Loader2 size={20} className="animate-spin" /> : <Navigation size={20} />}
          title={isLoadingGPS ? 'Getting your location…' : isResolvingAddress ? 'Looking up the address…' : 'Use my current location'}
          subtitle="Most accurate when you're at the vehicle" disabled={isLoadingGPS || isResolvingAddress} onClick={() => void handleUseCurrentLocation()} />
      </div>

      <div className="location-search">
        <label htmlFor="location-search">Search address</label>
        <div className="request-search__field">
          <Search size={17} aria-hidden="true" />
          <input id="location-search" type="text" autoComplete="off" placeholder="Street, place or landmark"
            aria-describedby={searchError && !isSearching ? 'location-search-error' : undefined}
            value={manualQuery} onChange={(event) => handleManualQueryChange(event.target.value)} />
          {isSearching && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
        </div>
        <p className="location-search__status" role="status">
          {isSearching ? 'Searching…' : suggestions.length > 0 ? `${suggestions.length} ${suggestions.length === 1 ? 'address' : 'addresses'} found` : manualQuery.trim().length > 0 && manualQuery.trim().length < 3 ? 'Type at least 3 characters' : ''}
        </p>
        {searchError && !isSearching && <p id="location-search-error" className="ui-alert ui-alert--warning" role="alert"><Info size={15} aria-hidden="true" /> {searchError}</p>}
        {suggestions.length > 0 && !isSearching && (
          <div className="ui-list location-results">
            {suggestions.map((suggestion) => (
              <ListRow key={suggestion.id} icon={<MapPin size={17} />} title={suggestion.label} chevron={false} onClick={() => handleSelectSuggestion(suggestion)} />
            ))}
          </div>
        )}
      </div>

      {addressWarning && <p className="ui-alert ui-alert--warning"><Info size={15} aria-hidden="true" /> {addressWarning}</p>}

      {selectedCoords && (
        <div className="location-map">
          <p className="location-map__hint"><Move size={15} aria-hidden="true" /> Drag the pin to your exact spot</p>
          <Suspense fallback={<Skeleton height={200} radius={16} width="100%" />}>
            <MapPinPicker lat={selectedCoords.lat} lng={selectedCoords.lng} onChange={handlePinMove} />
          </Suspense>
          {isUpdatingPin && <p className="location-search__status">Updating the address…</p>}
        </div>
      )}

      {showSelected && (
        <div className="location-selected">
          <Check size={17} aria-hidden="true" />
          <div>
            <strong>{selectedLabel}</strong>
            <a href={locationService.getMapUrl(selectedCoords)} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} aria-hidden="true" /> Open in Maps</a>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}
