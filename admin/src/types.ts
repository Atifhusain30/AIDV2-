export type VerificationStatus = 'pending' | 'under_review' | 'verified' | 'rejected' | 'suspended'
export type DocumentType = 'drivers_license' | 'identification' | 'insurance' | 'vehicle_registration'
export type QueueFilter = 'needs_review' | 'under_review' | 'verified' | 'expiring' | 'rejected' | 'suspended' | 'all'
export type DriverDecision = 'verify' | 'reject' | 'suspend' | 'reinstate'

export interface AdminProfile {
  id: string
  firstName: string
  lastName: string
  email: string
  role: 'admin'
}

export interface DriverSummary {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  accountStatus: string
  verificationStatus: VerificationStatus
  submittedAt: string | null
  reviewedAt: string | null
  credentialsValidUntil: string | null
  isOnline: boolean
  pendingDocuments: number
  createdAt: string
}

export interface ReviewDocument {
  id: string
  type: DocumentType
  fileName: string
  mimeType: string
  status: 'pending' | 'approved' | 'rejected'
  reviewNotes: string | null
  expiresOn: string | null
  uploadedAt: string
  fileUrl: string | null
}

export interface ReviewEvent {
  id: string
  action: string
  notes: string | null
  documentId: string | null
  actor: { id: string; name: string; role: string } | null
  createdAt: string
}

export interface Readiness {
  missing: DocumentType[]
  rejected: DocumentType[]
  unapproved: DocumentType[]
  expired: DocumentType[]
  canSubmit: boolean
  canVerify: boolean
  credentialsValidUntil: string | null
}

/** B15: ratings this driver received (admin view: true average, private notes on low ratings). */
export interface DriverRatings {
  average: number | null
  count: number
  lowRatingMaxStars: number
  recentLow: { bookingId: string; stars: number; comment: string | null; tags: string[]; serviceName: string; raterFirstName: string; createdAt: string }[]
}

export interface DriverDetail {
  driver: Omit<DriverSummary, 'pendingDocuments'> & { reviewNotes: string | null; rating: number | null; ratingCount?: number; totalJobs: number; status: VerificationStatus }
  documents: ReviewDocument[]
  ratings?: DriverRatings
  events: ReviewEvent[]
  readiness: Readiness
}
