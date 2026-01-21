/**
 * Services Index
 * Central export for all service modules
 */

export { default as locationService } from './location'
export { default as paymentService } from './payment'
export { default as documentService } from './documents'
export { default as apiService } from './api'

// New service layer for backend-ready architecture
export * as bookingService from './bookingService'
export * as chatService from './chatService'
export { default as locationServiceV2 } from './locationService'

// Re-export commonly used functions
export {
  getCurrentLocation,
  watchLocation,
  stopWatchLocation,
  requestLocationPermission,
  calculateDistance,
  estimateETA
} from './location'

export {
  getStripe,
  createPaymentIntent,
  processDemoPayment,
  formatAmount,
  dollarsToCents
} from './payment'

export {
  pickDocument,
  pickImage,
  uploadDocument,
  storeDocumentLocally,
  getStoredDocuments,
  validateDocumentRequirements,
  DOCUMENT_TYPE_LABELS
} from './documents'

export {
  customerLogin,
  customerRegister,
  driverLogin,
  driverRegister,
  logout,
  getAuthState,
  createBooking,
  getBooking,
  updateBookingStatus,
  getServiceRequests,
  acceptServiceRequest,
  updateDriverLocation,
  updateDriverOnlineStatus
} from './api'
