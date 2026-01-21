/**
 * MapPinPicker Component
 * Interactive map with draggable pin for location selection
 * Uses Leaflet + React-Leaflet with OpenStreetMap tiles
 */

import { useRef, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import type { LatLngExpression, LeafletEvent } from 'leaflet'

export interface MapPinPickerProps {
  lat: number
  lng: number
  onChange: (coords: { lat: number; lng: number }) => void
}

// Component to recenter map when coords change externally
function MapRecenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  
  // Update map center when lat/lng props change significantly
  useMemo(() => {
    const center = map.getCenter()
    const distance = Math.sqrt(
      Math.pow(center.lat - lat, 2) + Math.pow(center.lng - lng, 2)
    )
    // Only recenter if moved more than ~100 meters
    if (distance > 0.001) {
      map.setView([lat, lng], map.getZoom())
    }
  }, [lat, lng, map])
  
  return null
}

// Draggable marker component
function DraggableMarker({
  lat,
  lng,
  onDragEnd,
}: {
  lat: number
  lng: number
  onDragEnd: (coords: { lat: number; lng: number }) => void
}) {
  const markerRef = useRef<L.Marker>(null)
  
  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current
        if (marker) {
          const position = marker.getLatLng()
          onDragEnd({ lat: position.lat, lng: position.lng })
        }
      },
    }),
    [onDragEnd]
  )

  const position: LatLngExpression = [lat, lng]

  return (
    <Marker
      draggable
      eventHandlers={eventHandlers}
      position={position}
      ref={markerRef}
    />
  )
}

export default function MapPinPicker({ lat, lng, onChange }: MapPinPickerProps) {
  const center: LatLngExpression = [lat, lng]

  return (
    <div className="rounded-xl overflow-hidden border border-gray-700">
      <MapContainer
        center={center}
        zoom={16}
        scrollWheelZoom={false}
        style={{ height: 220, width: '100%' }}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <MapRecenter lat={lat} lng={lng} />
        <DraggableMarker lat={lat} lng={lng} onDragEnd={onChange} />
      </MapContainer>
      
      {/* Attribution overlay (styled) */}
      <div className="px-2 py-1 bg-gray-800/80 text-[10px] text-gray-500 text-right">
        © OpenStreetMap contributors
      </div>
    </div>
  )
}
