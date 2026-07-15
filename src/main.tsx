import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import 'leaflet/dist/leaflet.css'
import './rebrand.css'
import { initializeCapacitor } from './capacitor'

// Initialize Capacitor for native platforms
initializeCapacitor()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)



