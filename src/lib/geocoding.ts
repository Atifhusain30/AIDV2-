/**
 * Geocoding Helpers
 * - Reverse geocoding: Converts GPS coordinates to addresses
 * - Address search: Searches for addresses by query
 * Uses OpenStreetMap Nominatim (free, no API key required)
 */

export interface ReverseGeocodeResult {
  label: string
  raw?: NominatimResponse
}

// Address suggestion type for search results
export interface AddressSuggestion {
  id: string
  label: string
  lat: number
  lng: number
}

// Nominatim API response types
interface NominatimAddress {
  house_number?: string
  road?: string
  city?: string
  town?: string
  village?: string
  suburb?: string
  state?: string
  postcode?: string
  country?: string
  country_code?: string
}

interface NominatimResponse {
  display_name: string
  address: NominatimAddress
  lat: string
  lon: string
}

// In-memory cache to avoid repeated API calls for same coordinates
const geocodeCache = new Map<string, string>()

// In-memory cache for address search results
const searchCache = new Map<string, AddressSuggestion[]>()

/** E6: forget every address looked up (called on sign-out). */
export function clearGeocodingCache(): void {
  geocodeCache.clear()
  searchCache.clear()
}

/**
 * Generate cache key from coordinates (rounded to 5 decimal places)
 * 5 decimal places = ~1.1 meter precision, good enough for address lookup
 */
function getCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`
}

/**
 * Build a clean address label from Nominatim address parts
 */
function buildAddressLabel(address: NominatimAddress): string {
  const parts: string[] = []
  
  // Street address
  if (address.house_number && address.road) {
    parts.push(`${address.house_number} ${address.road}`)
  } else if (address.road) {
    parts.push(address.road)
  }
  
  // City (try multiple fields)
  const city = address.city || address.town || address.village || address.suburb
  if (city) {
    parts.push(city)
  }
  
  // State and postcode
  if (address.state) {
    if (address.postcode) {
      parts.push(`${address.state} ${address.postcode}`)
    } else {
      parts.push(address.state)
    }
  } else if (address.postcode) {
    parts.push(address.postcode)
  }
  
  return parts.join(', ')
}

/**
 * Reverse geocode coordinates to address
 * Uses OpenStreetMap Nominatim API
 * 
 * @param lat Latitude
 * @param lng Longitude
 * @returns Address label and raw response
 * @throws Error if request fails or times out
 */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  // Check cache first
  const cacheKey = getCacheKey(lat, lng)
  const cachedLabel = geocodeCache.get(cacheKey)
  if (cachedLabel) {
    console.log('[Geocoding] Cache hit:', cachedLabel)
    return { label: cachedLabel }
  }
  
  // Set up abort controller for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
  
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse')
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('lat', lat.toString())
    url.searchParams.set('lon', lng.toString())
    url.searchParams.set('addressdetails', '1')
    
    console.log('[Geocoding] Fetching address for:', lat, lng)
    
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        // Nominatim requires a User-Agent but browsers may not allow custom ones
        // The Accept header is always allowed
      },
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.status} ${response.statusText}`)
    }
    
    const data: NominatimResponse = await response.json()
    
    // Try to build a clean label from address parts
    let label = ''
    if (data.address) {
      label = buildAddressLabel(data.address)
    }
    
    // Fallback to display_name if our label is empty or too short
    if (!label || label.length < 5) {
      label = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    }
    
    // Cache the result
    geocodeCache.set(cacheKey, label)
    console.log('[Geocoding] Resolved address:', label)
    
    return {
      label,
      raw: data,
    }
  } catch (error) {
    clearTimeout(timeoutId)
    
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[Geocoding] Request timed out')
      throw new Error('Address lookup timed out')
    }
    
    console.error('[Geocoding] Error:', error)
    throw error
  }
}

// Nominatim search response type
interface NominatimSearchResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
  address?: NominatimAddress
}

/**
 * Search for addresses using a text query
 * Uses OpenStreetMap Nominatim Search API
 * 
 * @param query Search query (minimum 3 characters)
 * @param signal Optional AbortSignal for cancellation
 * @returns Array of address suggestions (max 6)
 */
export async function searchAddresses(
  query: string,
  signal?: AbortSignal
): Promise<AddressSuggestion[]> {
  const trimmedQuery = query.trim()
  
  // Don't search for very short queries
  if (trimmedQuery.length < 3) {
    return []
  }
  
  // Check cache first
  const cacheKey = trimmedQuery.toLowerCase()
  const cachedResults = searchCache.get(cacheKey)
  if (cachedResults) {
    console.log('[Geocoding] Search cache hit:', cacheKey)
    return cachedResults
  }
  
  // Set up abort controller for timeout (use provided signal or create new)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
  
  // If an external signal is provided, listen to it
  if (signal) {
    signal.addEventListener('abort', () => controller.abort())
  }
  
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('q', trimmedQuery)
    url.searchParams.set('addressdetails', '1')
    url.searchParams.set('limit', '6')
    
    console.log('[Geocoding] Searching addresses:', trimmedQuery)
    
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      throw new Error(`Address search failed: ${response.status} ${response.statusText}`)
    }
    
    const data: NominatimSearchResult[] = await response.json()
    
    // Map results to AddressSuggestion format
    const suggestions: AddressSuggestion[] = data.map((result) => ({
      id: result.place_id?.toString() || `${result.lat},${result.lon}`,
      label: result.display_name,
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
    }))
    
    // Cache the results
    searchCache.set(cacheKey, suggestions)
    console.log('[Geocoding] Found', suggestions.length, 'suggestions')
    
    return suggestions
  } catch (error) {
    clearTimeout(timeoutId)
    
    if (error instanceof Error && error.name === 'AbortError') {
      // Don't log aborted requests as errors (they're intentional)
      console.log('[Geocoding] Search aborted')
      throw error
    }
    
    console.error('[Geocoding] Search error:', error)
    throw error
  }
}

