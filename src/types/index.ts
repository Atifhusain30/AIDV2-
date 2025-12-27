export type ServiceType = 
  | 'oil_change'
  | 'battery_jump'
  | 'flat_tire'
  | 'lockout'
  | 'towing'
  | 'ev_charging'
  | 'fuel_delivery'

export type BookingStatus = 
  | 'pending'
  | 'searching'
  | 'accepted'
  | 'en_route'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export interface Service {
  id: ServiceType
  name: string
  description: string
  basePrice: number
  estimatedTime: number
}

export interface Mechanic {
  id: string
  name: string
  initials: string
  rating: number
  totalJobs: number
  specializations: ServiceType[]
  location: {
    lat: number
    lng: number
  }
  eta: number
  isOnline: boolean
}

export interface Vehicle {
  id: string
  make: string
  model: string
  year: number
  color: string
  licensePlate: string
  isElectric: boolean
}

export interface Booking {
  id: string
  service: Service
  status: BookingStatus
  mechanic?: Mechanic
  vehicle?: Vehicle
  location: {
    address: string
    lat: number
    lng: number
  }
  estimatedPrice: number
  estimatedArrival?: number
  createdAt: Date
  notes?: string
}

export interface SavedAddress {
  id: string
  label: string
  address: string
  lat: number
  lng: number
}

export interface Message {
  id: string
  senderId: string
  content: string
  timestamp: Date
  isRead: boolean
}

export interface Notification {
  id: string
  type: 'booking' | 'promo' | 'system'
  title: string
  body: string
  timestamp: Date
  isRead: boolean
}



