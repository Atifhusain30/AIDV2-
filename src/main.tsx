import React from 'react'
import ReactDOM from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import App from './App'
import './index.css'
import 'leaflet/dist/leaflet.css'
import './rebrand.css'
import { initializeCapacitor } from './capacitor'

// Initialize Capacitor for native platforms
initializeCapacitor()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* F4: framer-motion follows the phone's Reduce Motion setting (slides/scales become fades or nothing). */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </React.StrictMode>,
)



