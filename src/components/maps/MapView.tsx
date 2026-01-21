/**
 * Map View Component
 * Displays a map with markers for customer and driver locations
 * 
 * TODO: For production, integrate with Google Maps JavaScript API
 * Get API key from: https://console.cloud.google.com/google/maps-apis
 */

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { MapPin, Navigation, Loader2, RefreshCw, ExternalLink } from 'lucide-react'
import type { Location } from '../../types'

interface MapMarker {
  id: string
  position: Location
  type: 'customer' | 'driver' | 'destination'
  label?: string
}

interface MapViewProps {
  center: Location
  markers?: MapMarker[]
  zoom?: number
  showUserLocation?: boolean
  onLocationUpdate?: (location: Location) => void
  className?: string
  height?: string
}

// Static map URL generator (uses Google Static Maps API - requires API key for production)
const getStaticMapUrl = (
  center: Location, 
  markers: MapMarker[], 
  zoom: number = 14,
  width: number = 400,
  height: number = 300
): string => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  
  // Without API key, return placeholder
  if (!apiKey) {
    return ''
  }
  
  const baseUrl = 'https://maps.googleapis.com/maps/api/staticmap'
  const params = new URLSearchParams({
    center: `${center.lat},${center.lng}`,
    zoom: zoom.toString(),
    size: `${width}x${height}`,
    scale: '2',
    maptype: 'roadmap',
    style: 'feature:all|element:labels|visibility:on',
    key: apiKey
  })

  // Add markers
  markers.forEach(marker => {
    const color = marker.type === 'customer' ? 'blue' : marker.type === 'driver' ? 'green' : 'red'
    params.append('markers', `color:${color}|${marker.position.lat},${marker.position.lng}`)
  })

  return `${baseUrl}?${params.toString()}`
}

export default function MapView({
  center,
  markers = [],
  zoom = 14,
  showUserLocation = true,
  onLocationUpdate,
  className = '',
  height = '300px'
}: MapViewProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mapRef = useRef<HTMLDivElement>(null)

  const hasApiKey = !!import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  // Simulate loading
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1000)
    return () => clearTimeout(timer)
  }, [])

  const openInGoogleMaps = () => {
    const url = `https://www.google.com/maps/@${center.lat},${center.lng},${zoom}z`
    window.open(url, '_blank')
  }

  const openDirections = (destination: Location) => {
    const url = `https://www.google.com/maps/dir/${center.lat},${center.lng}/${destination.lat},${destination.lng}`
    window.open(url, '_blank')
  }

  return (
    <div 
      ref={mapRef}
      className={`relative bg-[#1a1a22] rounded-xl overflow-hidden ${className}`}
      style={{ height }}
    >
      {/* Loading State */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a22] z-10">
          <Loader2 size={32} className="text-violet-400 animate-spin" />
        </div>
      )}

      {/* Map Content */}
      {!isLoading && (
        <>
          {hasApiKey ? (
            // With API key - show static map image
            <img
              src={getStaticMapUrl(center, markers, zoom)}
              alt="Map"
              className="w-full h-full object-cover"
              onError={() => setError('Failed to load map')}
            />
          ) : (
            // Without API key - show placeholder with marker visualization
            <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a22] to-[#0f0f14]">
              {/* Grid pattern for map feel */}
              <div className="absolute inset-0 opacity-10">
                <div 
                  className="w-full h-full"
                  style={{
                    backgroundImage: `
                      linear-gradient(rgba(139, 92, 246, 0.3) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(139, 92, 246, 0.3) 1px, transparent 1px)
                    `,
                    backgroundSize: '50px 50px'
                  }}
                />
              </div>

              {/* Radial gradient for depth */}
              <div 
                className="absolute inset-0"
                style={{
                  background: 'radial-gradient(circle at center, rgba(139, 92, 246, 0.1) 0%, transparent 70%)'
                }}
              />

              {/* Center marker (customer location) */}
              <motion.div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', delay: 0.2 }}
              >
                <div className="relative">
                  {/* Pulse ring */}
                  <motion.div
                    className="absolute inset-0 rounded-full bg-violet-500/30"
                    animate={{ scale: [1, 2, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    style={{ width: 40, height: 40, marginLeft: -8, marginTop: -8 }}
                  />
                  {/* Pin */}
                  <div className="w-6 h-6 rounded-full bg-violet-500 flex items-center justify-center shadow-lg shadow-violet-500/50">
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                  {/* Pin shadow */}
                  <div className="w-4 h-1 bg-black/30 rounded-full mx-auto mt-1 blur-sm" />
                </div>
              </motion.div>

              {/* Driver markers (if any) */}
              {markers.filter(m => m.type === 'driver').map((marker, i) => (
                <motion.div
                  key={marker.id}
                  className="absolute"
                  style={{
                    left: `${50 + (Math.random() - 0.5) * 40}%`,
                    top: `${50 + (Math.random() - 0.5) * 40}%`,
                    transform: 'translate(-50%, -50%)'
                  }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', delay: 0.3 + i * 0.1 }}
                >
                  <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/50">
                    <Navigation size={16} className="text-white" />
                  </div>
                  {marker.label && (
                    <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-emerald-400 whitespace-nowrap">
                      {marker.label}
                    </span>
                  )}
                </motion.div>
              ))}

              {/* Coordinates display */}
              <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur-sm">
                <p className="text-xs text-gray-400 font-mono">
                  {center.lat.toFixed(4)}, {center.lng.toFixed(4)}
                </p>
              </div>

              {/* API key notice */}
              <div className="absolute top-3 left-3 right-3">
                <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <p className="text-xs text-amber-400">
                    Map visualization mode. Add VITE_GOOGLE_MAPS_API_KEY for full maps.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Open in Google Maps button */}
          <button
            onClick={openInGoogleMaps}
            className="absolute bottom-3 right-3 px-3 py-2 rounded-lg bg-black/50 backdrop-blur-sm flex items-center gap-2 text-white text-sm hover:bg-black/70 transition-colors"
          >
            <ExternalLink size={14} />
            Open Maps
          </button>
        </>
      )}

      {/* Error State */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1a22]">
          <p className="text-red-400 text-sm mb-2">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-violet-400 text-sm flex items-center gap-1"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

// Export helper to create map markers
export function createMapMarker(
  id: string,
  position: Location,
  type: 'customer' | 'driver' | 'destination',
  label?: string
): MapMarker {
  return { id, position, type, label }
}
