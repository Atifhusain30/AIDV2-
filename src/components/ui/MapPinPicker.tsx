/**
 * MapPinPicker Component
 * Interactive map with draggable pin for location selection
 * Uses Leaflet + React-Leaflet with OpenStreetMap tiles
 */

import { useRef, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import L, { type LatLngExpression, type LeafletEvent } from 'leaflet'

export interface MapPinPickerProps {
  lat: number
  lng: number
  onChange: (coords: { lat: number; lng: number }) => void
  /** Map height (default 220 px); the request flow's location step fills its map area. */
  height?: number | string
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

// The AID pin (violet head, white ring) instead of Leaflet's default blue marker; the tip is the spot.
const pinIcon = L.divIcon({
  className: 'pick-pin',
  html: '<span class="pick-pin__head"></span><span class="pick-pin__stem"></span>',
  // 44 px wide touch target around the 28 px head; the stem's tip is the anchor.
  iconSize: [44, 46],
  iconAnchor: [22, 46],
})

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
      icon={pinIcon}
      title="Map pin — drag it to your exact spot"
      draggable
      eventHandlers={eventHandlers}
      position={position}
      ref={markerRef}
    />
  )
}

export default function MapPinPicker({ lat, lng, onChange, height = 220 }: MapPinPickerProps) {
  const center: LatLngExpression = [lat, lng]

  return (
    <div className="pin-map" style={height === '100%' ? { height: '100%', display: 'flex', flexDirection: 'column' } : undefined}>
      <MapContainer
        center={center}
        zoom={16}
        scrollWheelZoom={false}
        style={height === '100%' ? { flex: 1, width: '100%' } : { height, width: '100%' }}
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
      <div className="pin-map__credit">
        © OpenStreetMap contributors
      </div>
    </div>
  )
}
