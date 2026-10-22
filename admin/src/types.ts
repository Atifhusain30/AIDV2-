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

// ---- B18: support reports inbox ----
export type ReportStatus = 'open' | 'in_review' | 'resolved'
export type ReportFilter = 'active' | ReportStatus | 'all'
export type ReportCategory = 'driver_behaviour' | 'customer_behaviour' | 'vehicle_damage' | 'pricing' | 'payment' | 'service_problem' | 'app_problem' | 'safety' | 'other'

export interface ReportSummary {
  id: string
  reporterRole: 'customer' | 'driver'
  reporterName: string
  reporterEmail: string
  category: ReportCategory
  categoryLabel: string
  isSafety: boolean
  message: string
  status: ReportStatus
  booking: { id: string; serviceName: string; status: string | null } | null
  noteCount?: number
  /** Copied from a B10 job issue report (booking_events) by the migration. */
  fromJobIssue: boolean
  createdAt: string
  updatedAt: string | null
  resolvedAt: string | null
}

export interface ReportCounts { open: number; in_review: number; resolved: number; safetyActive: number }

export interface ReportParty { id: string; name: string; email: string; phone: string }

/** B12: the chat of the job a report is about, with who sent what, and blocks between the two people. */
export interface ReportChat {
  bookingId: string | null
  messages: { id: string; senderRole: 'customer' | 'driver'; senderName: string; body: string; createdAt: string; readAt: string | null }[]
  blocks: { blockerRole: 'customer' | 'driver'; blockerName: string; sameJob: boolean; createdAt: string }[]
}

export interface ReportDetail extends Omit<ReportSummary, 'booking'> {
  reporter: (ReportParty & { role: 'customer' | 'driver'; otherReports: number }) | null
  resolvedBy: { id: string; name: string } | null
  booking: {
    id: string; serviceName: string; status: string; statusWhenReported: string | null
    address: string; dropoffAddress: string | null; price: number | null
    createdAt: string; acceptedAt: string | null; completedAt: string | null; cancelledAt: string | null; expiredAt: string | null
    customer: ReportParty | null; driver: ReportParty | null
  } | null
  events: { id: string; action: 'status_changed' | 'note_added'; fromStatus: ReportStatus | null; toStatus: ReportStatus | null; note: string | null; actor: { id: string; name: string; role: string } | null; createdAt: string }[]
}
