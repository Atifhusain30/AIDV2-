import type { Driver } from '../types'

export type DriverEligibility = 'eligible' | 'start' | 'review' | 'rejected' | 'expired' | 'suspended'

/** Mirrors server requireVerifiedDriver: verified status AND unexpired credentials. */
export function driverEligibility(driver: Pick<Driver, 'verificationStatus' | 'credentialsValidUntil'> | null | undefined, today = new Date()): DriverEligibility {
  switch (driver?.verificationStatus) {
    case 'verified': {
      const validUntil = driver.credentialsValidUntil?.slice(0, 10)
      return validUntil && validUntil > today.toISOString().slice(0, 10) ? 'eligible' : 'expired'
    }
    case 'under_review': return 'review'
    case 'rejected': return 'rejected'
    case 'suspended': return 'suspended'
    default: return 'start'
  }
}

export const ELIGIBILITY_COPY: Record<Exclude<DriverEligibility, 'eligible'>, { title: string; detail: string; action: string }> = {
  start: { title: 'Verification required', detail: 'Upload your license, ID, insurance, and registration to start taking work.', action: 'Start verification' },
  review: { title: 'Application under review', detail: 'We are reviewing your documents. You can go online once you are approved.', action: 'View application' },
  rejected: { title: 'Changes needed', detail: 'Some documents need to be replaced before you can be approved.', action: 'Fix documents' },
  expired: { title: 'Documents expired', detail: 'Your license, insurance, or registration has expired. Upload a current copy to keep driving.', action: 'Update documents' },
  suspended: { title: 'Account suspended', detail: 'You cannot take work right now. Open your application for details.', action: 'View details' },
}
