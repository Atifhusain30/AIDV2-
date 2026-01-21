/**
 * Leaflet Icon Fix for Vite/Webpack bundlers
 * Fixes the default marker icons not displaying correctly
 */

import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

let isFixed = false

/**
 * Apply the Leaflet default icon fix
 * Call this once at app startup
 */
export function applyLeafletIconFix(): void {
  if (isFixed) return
  
  // @ts-expect-error Leaflet internal override for bundler compatibility
  delete L.Icon.Default.prototype._getIconUrl
  
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
  })
  
  isFixed = true
  console.log('[Leaflet] Icon fix applied')
}
