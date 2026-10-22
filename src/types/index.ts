// Service Types
export type ServiceType = 
  | 'oil_change'
  | 'battery_jump'
  | 'flat_tire'
  | 'lockout'
  | 'towing'
  | 'ev_charging'
  | 'fuel_delivery'
  | 'detailing'
  | 'window_tinting'

// Booking Status Flow
export type BookingStatus = 
  | 'pending'          // Request created, waiting for driver
  | 'searching'        // Actively searching for driver
  | 'accepted'         // Driver accepted
  | 'en_route'         // Driver on the way
  | 'arrived'          // Driver arrived at location
  | 'in_progress'      // Service being performed
  | 'completed'        // Service completed
  | 'cancelled'        // Request cancelled

// Payment Status
export type PaymentStatus = 
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'refunded'

// User Roles
export type UserRole = 'customer' | 'driver' | 'admin'

// Driver Verification Status
export type VerificationStatus = 'pending' | 'under_review' | 'verified' | 'rejected' | 'suspended'

// Service Definition
export interface Service {
  id: ServiceType
  name: string
  description: string
  basePrice: number
  estimatedTime: number
}

// Location with optional address
export interface Location {
  lat: number
  lng: number
  address?: string
  timestamp?: number
}

// User Base Interface
export interface UserBase {
  id: string
  email: string
  phone: string
  firstName: string
  lastName: string
  role: UserRole
  createdAt: Date
}

// Customer Profile
export interface Customer extends UserBase {
  role: 'customer'
  savedAddresses: SavedAddress[]
  vehicles: Vehicle[]
  paymentMethods: PaymentMethod[]
}

// Driver Profile
export interface Driver extends UserBase {
  role: 'driver'
  isOnline: boolean
  isVerified: boolean
  verificationStatus: VerificationStatus
  /** Earliest expiration among approved license/insurance/registration (YYYY-MM-DD). */
  credentialsValidUntil?: string | null
  documents: DriverDocument[]
  rating: number
  totalJobs: number
  specializations: ServiceType[]
  currentLocation?: Location
  /** Required (complete) before the driver can go online or accept work. */
  vehicle?: DriverVehicle | null
}

// Driver Document (DL, ID, etc.)
export type DriverDocumentType = 'drivers_license' | 'identification' | 'insurance' | 'vehicle_registration'

export interface DriverDocument {
  id: string
  type: DriverDocumentType
  fileUrl?: string
  fileName: string
  mimeType?: string
  uploadedAt: Date
  status: 'pending' | 'approved' | 'rejected'
  /** YYYY-MM-DD; required for license, insurance, and registration. */
  expiresOn?: string | null
  /** Reviewer's reason when a document is rejected. */
  reviewNotes?: string | null
}

export interface VerificationReadiness {
  missing: DriverDocumentType[]
  rejected: DriverDocumentType[]
  unapproved: DriverDocumentType[]
  expired: DriverDocumentType[]
  canSubmit: boolean
  canVerify: boolean
  credentialsValidUntil: string | null
}

export interface DriverVerification {
  status: VerificationStatus
  reviewNotes: string | null
  submittedAt: string | null
  reviewedAt: string | null
  credentialsValidUntil: string | null
  requiredDocuments: DriverDocumentType[]
  readiness: VerificationReadiness
  documents: DriverDocument[]
}

// Driver's own service vehicle (driver_profiles.vehicle_*), saved via PATCH /api/drivers/me/vehicle.
export type DriverEquipmentType = 'flatbed' | 'wheel_lift' | 'light_duty'

export interface DriverVehicle {
  make: string
  model: string
  /** Null for vehicles saved before year/state/equipment were collected. */
  year: number | null
  color: string
  plate: string
  /** Two-letter US state code, '' if not added yet. */
  plateState: string
  equipmentType: DriverEquipmentType | ''
}

// Mechanic (legacy, alias for Driver)
export interface Mechanic {
  id: string
  name: string
  initials: string
  rating: number
  totalJobs: number
  specializations: ServiceType[]
  location: Location
  eta: number
  isOnline: boolean
}

// Customer Vehicle
export interface Vehicle {
  id: string
  make: string
  model: string
  year: number
  color: string
  licensePlate: string
  isElectric: boolean
}

// Saved Address
export interface SavedAddress {
  id: string
  label: string
  address: string
  lat: number
  lng: number
}

// Payment Method
export interface PaymentMethod {
  id: string
  type: 'card' | 'apple_pay' | 'google_pay'
  brand?: 'visa' | 'mastercard' | 'amex' | 'discover'
  last4?: string
  expiryMonth?: number
  expiryYear?: number
  isDefault: boolean
}

// Payment Intent
export interface PaymentIntent {
  id: string
  clientSecret: string
  amount: number
  currency: string
  status: PaymentStatus
}

// Price breakdown for receipts
export interface PriceBreakdown {
  baseFee: number
  distanceFee: number
  surgeFee?: number
  total: number
}

// Booking vehicle snapshot (stored with booking for historical record)
export interface BookingVehicleSnapshot {
  vehicleId: string
  label: string  // e.g. "2019 Honda Civic"
  plate?: string
  color?: string
}

/** The vehicle a driver arrives in (what the customer should look for). */
export interface JobDriverVehicle {
  make: string
  model: string
  color: string
  plate: string
}

/** Approximate arrival estimate: estimated road miles at an average city/highway speed. */
export interface DriverEta {
  miles: number
  minutes: number
  approximate: true
  /** When the driver location this estimate is based on was taken. */
  fromLocationAt: string | null
}

/** The other person on a job. Phone is only present while the job is active. */
export interface JobContact {
  name: string        // "Marcus T."
  firstName: string
  phone?: string
}

export interface JobDriver extends JobContact {
  id: string
  rating: number
  totalJobs: number
  vehicle: JobDriverVehicle | null
}

// Service Request (Booking)
export interface Booking {
  id: string
  customerId: string
  driverId?: string
  service: Service
  status: BookingStatus
  mechanic?: Mechanic  // Legacy
  vehicle?: BookingVehicleSnapshot  // Vehicle snapshot at time of booking
  location: {
    address: string
    lat: number
    lng: number
  }
  dropoffLocation?: {
    address: string
    lat: number
    lng: number
  }
  estimatedPrice: number
  finalPrice?: number
  estimatedArrival?: number
  payment?: {
    intentId: string
    status: PaymentStatus
    amount: number
  }
  driverLocation?: Location & { updatedAt?: string }
  /** Server-estimated arrival from the driver's last shared position (approximate; until arrival). */
  driverEta?: DriverEta
  /** Assigned driver, shown to the customer once accepted. */
  driver?: JobDriver
  /** Customer contact, shown to the driver once accepted. */
  customer?: JobContact
  // Provider tracking coordinates (for live tracking)
  providerCoords?: { lat: number; lng: number }
  // Live ETA in minutes (updates during tracking)
  providerETA?: number
  // Price breakdown for receipt
  priceBreakdown?: PriceBreakdown
  // Payment method display label (e.g., "Visa •••• 4242")
  paymentMethodLabel?: string
  // Optional tip amount added by user
  tipAmount?: number
  // Whether receipt has been viewed
  receiptViewed?: boolean
  notes?: string
  createdAt: Date
  acceptedAt?: Date
  /** Server timestamps for each lifecycle step (audit trail lives in booking_events). */
  arrivedAt?: Date
  startedAt?: Date
  completedAt?: Date
  cancelledAt?: Date
  /** Who ended the job, when cancelled. */
  cancelledBy?: 'customer' | 'driver' | 'support'
}

// Service Request (incoming to driver)
export interface ServiceRequest {
  id: string
  customerId: string
  customerName: string
  customerPhone: string
  service: Service
  location: Location
  dropoffLocation?: Location
  vehicle?: Vehicle
  estimatedPrice: number
  notes?: string
  createdAt: Date
  expiresAt: Date // Request expires if not accepted
}

// Chat Message
export interface Message {
  id: string
  bookingId: string
  senderId: string
  senderType: 'customer' | 'driver' | 'system'
  content: string
  timestamp: Date
  isRead: boolean
}

// Notification
export interface Notification {
  id: string
  userId: string
  type: 'booking' | 'promo' | 'system' | 'driver_request'
  title: string
  body: string
  data?: Record<string, unknown>
  timestamp: Date
  isRead: boolean
}

// Auth State
export interface AuthState {
  isAuthenticated: boolean
  user: Customer | Driver | null
  token: string | null
}

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
  /** Server validation: which input field was rejected. */
  field?: string
  /** Server machine-readable reason, e.g. 'vehicle_required'. */
  code?: string
}

// Geolocation Position
export interface GeoPosition {
  coords: {
    latitude: number
    longitude: number
    accuracy: number
    altitude: number | null
    altitudeAccuracy: number | null
    heading: number | null
    speed: number | null
  }
  timestamp: number
}