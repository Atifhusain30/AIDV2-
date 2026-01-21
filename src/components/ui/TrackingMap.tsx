/**
 * TrackingMap Component
 * Shows user location and provider location on a map
 * Used for live provider tracking during en_route status
 */

import { useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { LatLngExpression } from 'leaflet'

export interface TrackingMapProps {
  user: { lat: number; lng: number }
  provider?: { lat: number; lng: number } | null
}

// Custom icon for provider (car/vehicle)
const providerIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10" fill="#10b981" fill-opacity="0.2"/>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
  `),
  iconSize: [32, 32],
  iconAnchor: [16, 16],
})

// Custom icon for user (destination)
const userIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" fill="#3b82f6" fill-opacity="0.2"/>
      <circle cx="12" cy="10" r="3" fill="#3b82f6"/>
    </svg>
  `),
  iconSize: [32, 32],
  iconAnchor: [16, 32],
})

// Component to fit bounds when both markers exist
function MapBounds({ user, provider }: { user: { lat: number; lng: number }; provider?: { lat: number; lng: number } | null }) {
  const map = useMap()
  
  useMemo(() => {
    if (provider) {
      const bounds = L.latLngBounds(
        [user.lat, user.lng],
        [provider.lat, provider.lng]
      )
      // Add padding to the bounds
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 })
    } else {
      map.setView([user.lat, user.lng], 16)
    }
  }, [user.lat, user.lng, provider?.lat, provider?.lng, map])
  
  return null
}

export default function TrackingMap({ user, provider }: TrackingMapProps) {
  const center: LatLngExpression = provider
    ? [(user.lat + provider.lat) / 2, (user.lng + provider.lng) / 2]
    : [user.lat, user.lng]

  // Route line between provider and user
  const routeLine: LatLngExpression[] | null = provider
    ? [[provider.lat, provider.lng], [user.lat, user.lng]]
    : null

  return (
    <div className="rounded-xl overflow-hidden border border-gray-700">
      <MapContainer
        center={center}
        zoom={15}
        scrollWheelZoom={false}
        style={{ height: 220, width: '100%' }}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        
        <MapBounds user={user} provider={provider} />
        
        {/* Route line */}
        {routeLine && (
          <Polyline
            positions={routeLine}
            color="#10b981"
            weight={3}
            opacity={0.6}
            dashArray="10, 10"
          />
        )}
        
        {/* Provider marker */}
        {provider && (
          <Marker
            position={[provider.lat, provider.lng]}
            icon={providerIcon}
          />
        )}
        
        {/* User marker (destination) */}
        <Marker
          position={[user.lat, user.lng]}
          icon={userIcon}
        />
      </MapContainer>
      
      {/* Legend */}
      <div className="px-3 py-2 bg-gray-800/80 flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="text-gray-400">Provider</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-gray-400">You</span>
          </div>
        </div>
        <span className="text-gray-500">© OpenStreetMap</span>
      </div>
    </div>
  )
}
