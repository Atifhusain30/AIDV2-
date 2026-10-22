import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, Navigation, X, ExternalLink, Loader2, AlertCircle, Check, Info, Search, Move } from 'lucide-react'
import { useAppStore, GeoCoords } from '../../store/useAppStore'
import locationService, { AddressSuggestion } from '../../services/locationService'
import Dialog from '../ui/Dialog'

// Lazy load MapPinPicker to avoid SSR issues with Leaflet
const MapPinPicker = lazy(() => import('../ui/MapPinPicker'))

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

  // Local state
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

  // Ref for aborting search requests
  const searchAbortRef = useRef<AbortController | null>(null)

  const isOpen = activeModal === 'locationConfirm'

  // Reset state when modal opens
  const handleOpen = useCallback(() => {
    // Pre-populate with existing confirmed location if available
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
    
    // Clear suggestions if query is too short
    if (query.length < 3) {
      setSuggestions([])
      setSearchError(null)
      return
    }

    // Debounce search
    const timeoutId = setTimeout(async () => {
      try {
        setIsSearching(true)
        setSearchError(null)
        
        // Abort any previous search
        searchAbortRef.current?.abort()
        searchAbortRef.current = new AbortController()
        
        const results = await locationService.searchAddressSuggestions(query, searchAbortRef.current.signal)
        setSuggestions(results)
      } catch (err) {
        // Ignore abort errors (they're intentional)
        if (err instanceof Error && err.name === 'AbortError') {
          return
        }
        console.error('[LocationConfirmModal] Search error:', err)
        setSearchError('Could not search right now')
        setSuggestions([])
      } finally {
        setIsSearching(false)
      }
    }, 400)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [manualQuery])

  // Handle using current GPS location
  const handleUseCurrentLocation = async () => {
    // Prevent double-taps while loading
    if (isLoadingGPS || isResolvingAddress) return
    
    setIsLoadingGPS(true)
    setError(null)
    setAddressWarning(null)
    setSuggestions([]) // Clear any search suggestions
    setSearchError(null)

    try {
      // Step 1: Get GPS coordinates
      const current = await locationService.getCurrentLocationSelection()
      const coords = current.coords
      setSelectedCoords(coords)
      console.log('[LocationConfirmModal] GPS location acquired:', coords)
      
      // Step 2: Resolve address via reverse geocoding
      setIsLoadingGPS(false)
      setIsResolvingAddress(true)
      setSelectedLabel('Looking up address...')
      
      try {
        const label = current.label
        setSelectedLabel(label)
        setManualQuery(label) // Sync with manual input
        setAddressWarning(null)
        console.log('[LocationConfirmModal] Address resolved:', label)
      } catch (geocodeErr) {
        // Reverse geocoding failed - use fallback label but still allow confirm
        console.warn('[LocationConfirmModal] Reverse geocoding failed:', geocodeErr)
        setSelectedLabel('Current location (GPS)')
        setManualQuery('Current location (GPS)')
        setAddressWarning("Couldn't fetch address — you can still confirm with GPS coordinates.")
      }
    } catch (err) {
      console.error('[LocationConfirmModal] GPS error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Unable to get location'
      
      if (errorMessage.includes('denied') || errorMessage.includes('permission')) {
        setError('Location permission denied. Please enable location access in your device settings, or enter your address manually.')
      } else if (errorMessage.includes('timeout')) {
        setError('Location request timed out. Please try again or enter your address manually.')
      } else {
        setError('Unable to get your location. Please enter your address manually.')
      }
    } finally {
      setIsLoadingGPS(false)
      setIsResolvingAddress(false)
    }
  }

  // Handle manual address input change
  const handleManualQueryChange = (value: string) => {
    setManualQuery(value)
    // Clear coords when manually typing (unless user picked a suggestion)
    setSelectedCoords(null)
    // Update selected label to match what user is typing
    if (value.trim()) {
      setSelectedLabel(value.trim())
    } else {
      setSelectedLabel('')
    }
    setAddressWarning(null)
  }

  // Handle selecting a suggestion
  const handleSelectSuggestion = (suggestion: AddressSuggestion) => {
    setSelectedLabel(suggestion.label)
    setSelectedCoords({ lat: suggestion.lat, lng: suggestion.lng })
    setManualQuery(suggestion.label)
    setSuggestions([])
    setSearchError(null)
    setAddressWarning(null)
    console.log('[LocationConfirmModal] Selected suggestion:', suggestion.label)
  }

  // Handle pin drag on map
  const handlePinMove = async (newCoords: { lat: number; lng: number }) => {
    // Update coords immediately
    setSelectedCoords({ lat: newCoords.lat, lng: newCoords.lng })
    setIsUpdatingPin(true)
    setAddressWarning(null)
    
    // Store previous label as fallback
    const previousLabel = selectedLabel
    setSelectedLabel('Updating address...')
    
    try {
      const label = await locationService.reverseGeocodeLabel(newCoords.lat, newCoords.lng)
      setSelectedLabel(label)
      setManualQuery(label) // Keep search input in sync
      console.log('[LocationConfirmModal] Pin moved, address updated:', label)
    } catch (err) {
      // Reverse geocoding failed - use fallback
      console.warn('[LocationConfirmModal] Pin move geocode failed:', err)
      const fallbackLabel = previousLabel && previousLabel !== 'Updating address...' 
        ? previousLabel 
        : 'Pinned location'
      setSelectedLabel(fallbackLabel)
      setManualQuery(fallbackLabel)
      setAddressWarning("Couldn't update address — location saved with coordinates.")
    } finally {
      setIsUpdatingPin(false)
    }
  }

  // Handle confirm
  const handleConfirm = () => {
    // Use selectedLabel if set, otherwise fall back to manualQuery
    const finalLabel = selectedLabel.trim() || manualQuery.trim()
    
    try {
      const resolved = locationService.requireResolvedLocation(finalLabel, selectedCoords)
      confirmLocation(resolved.label, resolved.coords)
    } catch (locationError) {
      setError(locationError instanceof Error ? locationError.message : 'Select a valid location.')
      return
    }
    
    // Return to the modal that opened us (e.g., ServicesModal) with the same step
    if (pendingReturnModal) {
      setModalStep(pendingReturnModalStep)
      setActiveModalPreserveStep(pendingReturnModal)
      setPendingReturnModal(null)
    } else {
      setActiveModal(null)
    }
  }

  // Determine if confirm button should be enabled
  const canConfirm = Boolean((selectedLabel.trim() || manualQuery.trim()) && selectedCoords) &&
                     !isLoadingGPS && 
                     !isResolvingAddress && 
                     !isUpdatingPin &&
                     selectedLabel !== 'Looking up address...' &&
                     selectedLabel !== 'Updating address...'

  // Handle close (cancel without confirming)
  const handleClose = () => {
    // Return to the modal that opened us (e.g., ServicesModal) with the same step
    if (pendingReturnModal) {
      setModalStep(pendingReturnModalStep)
      setActiveModalPreserveStep(pendingReturnModal)
      setPendingReturnModal(null)
    } else {
      setActiveModal(null)
    }
  }

  // When modal opens, initialize state
  if (isOpen && selectedLabel === '' && userLocationLabel) {
    handleOpen()
  }

  return (
    <>
      {isOpen && (
        <Dialog labelledBy="location-confirm-title" describedBy="location-confirm-text" onClose={handleClose} handle={false}
          backdropClassName="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
          className="w-full max-h-[90vh] overflow-auto aid-sheet-in">
            <div className="bg-gray-900 rounded-t-3xl shadow-2xl border-t border-gray-800">
              {/* Handle bar */}
              <div className="flex justify-center pt-3 pb-2" aria-hidden="true">
                <div className="w-12 h-1.5 bg-gray-700 rounded-full" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-6 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-blue-400" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 id="location-confirm-title" className="text-xl font-bold text-white">Confirm Location</h2>
                    <p id="location-confirm-text" className="text-sm text-gray-400">Where should we send help?</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="Close"
                  className="w-11 h-11 grid place-items-center rounded-full hover:bg-gray-800 transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" aria-hidden="true" />
                </button>
              </div>

              <div className="px-6 pb-6 space-y-4">
                {/* Error message */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    role="alert"
                    className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl"
                  >
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-300">{error}</p>
                  </motion.div>
                )}

                {/* GPS Location Button */}
                <button
                  onClick={handleUseCurrentLocation}
                  disabled={isLoadingGPS || isResolvingAddress}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
                    selectedCoords
                      ? 'bg-blue-500/20 border-blue-500/50'
                      : 'bg-gray-800/50 border-gray-700 hover:border-blue-500/50'
                  } ${(isLoadingGPS || isResolvingAddress) ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    selectedCoords ? 'bg-blue-500/30' : 'bg-gray-700'
                  }`}>
                    {(isLoadingGPS || isResolvingAddress) ? (
                      <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                    ) : (
                      <Navigation className="w-6 h-6 text-blue-400" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold text-white">
                      {isLoadingGPS 
                        ? 'Getting location...' 
                        : isResolvingAddress 
                          ? 'Looking up address...'
                          : 'Use my current location'}
                    </p>
                    <p className="text-sm text-gray-400">
                      {selectedCoords
                        ? `${selectedCoords.lat.toFixed(5)}, ${selectedCoords.lng.toFixed(5)}`
                        : 'Requires location permission'}
                    </p>
                  </div>
                  {selectedCoords && !isLoadingGPS && !isResolvingAddress && (
                    <Check className="w-5 h-5 text-blue-400" />
                  )}
                </button>

                {/* Address warning (when reverse geocoding fails) */}
                {addressWarning && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl"
                  >
                    <Info className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-300">{addressWarning}</p>
                  </motion.div>
                )}

                {/* Divider */}
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-px bg-gray-700" />
                  <span className="text-sm text-gray-400">or search address</span>
                  <div className="flex-1 h-px bg-gray-700" />
                </div>

                {/* Address Search Input with Autocomplete */}
                <div className="space-y-2">
                  <label htmlFor="location-search" className="text-sm font-medium text-gray-300">
                    Search address
                  </label>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" aria-hidden="true" />
                    <input
                      id="location-search"
                      type="text"
                      autoComplete="off"
                      aria-describedby={searchError && !isSearching ? 'location-search-error' : undefined}
                      value={manualQuery}
                      onChange={(e) => handleManualQueryChange(e.target.value)}
                      placeholder="Type to search..."
                      className="w-full pl-12 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                    {isSearching && (
                      <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-400 animate-spin" />
                    )}
                  </div>

                  {/* Search Status */}
                  <p className="text-xs text-gray-400 pl-1" role="status">
                    {isSearching ? 'Searching...' : suggestions.length > 0 ? `${suggestions.length} ${suggestions.length === 1 ? 'address' : 'addresses'} found` : ''}
                  </p>

                  {/* Search Error */}
                  {searchError && !isSearching && (
                    <p id="location-search-error" className="text-xs text-amber-400 pl-1" role="alert">{searchError}</p>
                  )}

                  {/* Suggestions Dropdown */}
                  <AnimatePresence>
                    {suggestions.length > 0 && !isSearching && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden max-h-[220px] overflow-y-auto"
                      >
                        {suggestions.map((suggestion) => (
                          <button
                            key={suggestion.id}
                            onClick={() => handleSelectSuggestion(suggestion)}
                            className="w-full px-4 py-3 text-left hover:bg-gray-700/50 active:bg-gray-700 transition-colors border-b border-gray-700/50 last:border-b-0"
                          >
                            <div className="flex items-start gap-3">
                              <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                              <p className="text-sm text-white line-clamp-2">{suggestion.label}</p>
                            </div>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Hint for manual entry */}
                  {manualQuery.trim().length > 0 && manualQuery.trim().length < 3 && (
                    <p className="text-xs text-gray-400 pl-1">Type at least 3 characters to search</p>
                  )}
                </div>

                {/* Map Pin Picker - shows when coords exist */}
                {selectedCoords && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-2"
                  >
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <Move className="w-4 h-4" />
                      <span>Drag the pin to adjust your exact spot</span>
                    </div>
                    <Suspense fallback={
                      <div className="h-[220px] rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                      </div>
                    }>
                      <MapPinPicker
                        lat={selectedCoords.lat}
                        lng={selectedCoords.lng}
                        onChange={handlePinMove}
                      />
                    </Suspense>
                    {isUpdatingPin && (
                      <p className="text-xs text-blue-400 pl-1">Updating address...</p>
                    )}
                  </motion.div>
                )}

                {/* Preview Card */}
                {selectedLabel && selectedLabel !== 'Looking up address...' && selectedLabel !== 'Updating address...' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-gray-800/50 border border-gray-700 rounded-xl space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-400" />
                      <span className="text-sm font-medium text-gray-300">Selected Location</span>
                    </div>
                    <p className="text-white font-medium">{selectedLabel}</p>
                    
                    {selectedCoords && (
                      <a
                        href={locationService.getMapUrl(selectedCoords)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Open in Maps
                      </a>
                    )}
                  </motion.div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleClose}
                    className="flex-1 py-3 px-4 bg-gray-800 text-white font-semibold rounded-xl hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={!canConfirm}
                    className={`flex-1 py-3 px-4 font-semibold rounded-xl transition-colors ${
                      canConfirm
                        ? 'bg-violet-600 text-white hover:bg-violet-700'
                        : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {isResolvingAddress || isUpdatingPin ? 'Updating...' : 'Confirm Location'}
                  </button>
                </div>
              </div>
            </div>
        </Dialog>
      )}
    </>
  )
}
