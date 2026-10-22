/**
 * Customer map: pickup pin plus the driver's last shared position.
 * The driver marker dims when the position is stale. Lazy-loaded (Leaflet needs the DOM).
 */

import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'

type Point = { lat: number; lng: number }

export interface LiveDriverMapProps {
  pickup: Point
  driver: Point | null
  stale?: boolean
  /** Draw the straight connector only while the driver is heading to the pickup. */
  showConnector?: boolean
}

const pickupIcon = L.divIcon({
  className: 'track-pin',
  html: '<span class="track-pin__dot"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})

const driverIcon = (stale: boolean) => L.divIcon({
  className: `track-car${stale ? ' is-stale' : ''}`,
  // Lucide "truck" glyph, inlined because Leaflet markers are plain HTML.
  html: '<span class="track-car__pulse"></span><span class="track-car__body"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg></span>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
})

function FitView({ pickup, driver }: { pickup: Point; driver: Point | null }) {
  const map = useMap()
  useEffect(() => {
    if (driver) map.fitBounds(L.latLngBounds([pickup.lat, pickup.lng], [driver.lat, driver.lng]), { paddingTopLeft: [40, 60], paddingBottomRight: [40, 64], maxZoom: 16, animate: false }) // room for the status chip and the overlapping sheet
    else map.setView([pickup.lat, pickup.lng], 15, { animate: false })
  }, [map, pickup.lat, pickup.lng, driver?.lat, driver?.lng])
  return null
}

export default function LiveDriverMap({ pickup, driver, stale = false, showConnector = true }: LiveDriverMapProps) {
  return (
    <MapContainer
      className="track-map__leaflet"
      center={[pickup.lat, pickup.lng]}
      zoom={15}
      scrollWheelZoom={false}
      zoomControl={false}
      attributionControl={false}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitView pickup={pickup} driver={driver} />
      {driver && showConnector && (
        <Polyline positions={[[driver.lat, driver.lng], [pickup.lat, pickup.lng]]} pathOptions={{ color: '#a78bfa', weight: 3, opacity: 0.7, dashArray: '6 8' }} />
      )}
      <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon} />
      {driver && <Marker position={[driver.lat, driver.lng]} icon={driverIcon(stale)} />}
    </MapContainer>
  )
}
