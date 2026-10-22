// Driver verification policy for individual providers. Pure functions only:
// HTTP handling lives in app.js and SQL lives in repository.js.

const REQUIRED_DOCUMENT_TYPES = Object.freeze(['drivers_license', 'identification', 'insurance', 'vehicle_registration']);
const EXPIRING_DOCUMENT_TYPES = Object.freeze(new Set(['drivers_license', 'insurance', 'vehicle_registration']));
const DRIVER_DECISIONS = Object.freeze({
  verify: { from: ['under_review', 'rejected', 'pending'], to: 'verified', event: 'verified', requiresApprovedDocuments: true },
  reject: { from: ['pending', 'under_review', 'verified'], to: 'rejected', event: 'rejected', requiresNotes: true },
  suspend: { from: ['verified', 'under_review'], to: 'suspended', event: 'suspended', requiresNotes: true },
  reinstate: { from: ['suspended'], to: 'verified', event: 'reinstated', requiresApprovedDocuments: true },
});
const DRIVER_STATUS_FILTERS = Object.freeze(new Set(['pending', 'under_review', 'verified', 'rejected', 'suspended', 'needs_review', 'expiring']));

function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function parseIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
}

function cleanNotes(value) {
  return typeof value === 'string' ? value.trim().slice(0, 1000) : '';
}

// Most recent upload per document type; older uploads are history only.
function latestDocumentsByType(documents) {
  const latest = new Map();
  for (const document of documents) {
    const current = latest.get(document.type);
    if (!current || new Date(document.uploadedAt) > new Date(current.uploadedAt)) latest.set(document.type, document);
  }
  return latest;
}

function verificationReadiness(documents, now = new Date()) {
  const today = todayIso(now);
  const latest = latestDocumentsByType(documents);
  const missing = [];
  const rejected = [];
  const unapproved = [];
  const expired = [];
  const expiries = [];
  for (const type of REQUIRED_DOCUMENT_TYPES) {
    const document = latest.get(type);
    if (!document) { missing.push(type); continue; }
    if (document.status === 'rejected') rejected.push(type);
    else if (document.status !== 'approved') unapproved.push(type);
    if (EXPIRING_DOCUMENT_TYPES.has(type)) {
      if (!document.expiresOn || document.expiresOn <= today) expired.push(type);
      else expiries.push(document.expiresOn);
    }
  }
  return {
    missing,
    rejected,
    unapproved,
    expired,
    canSubmit: missing.length === 0 && rejected.length === 0 && expired.length === 0,
    canVerify: missing.length === 0 && rejected.length === 0 && unapproved.length === 0 && expired.length === 0,
    credentialsValidUntil: expiries.length ? expiries.sort()[0] : null,
  };
}

function credentialsCurrent(profile, now = new Date()) {
  return Boolean(profile.credentialsValidUntil) && String(profile.credentialsValidUntil).slice(0, 10) > todayIso(now);
}

module.exports = {
  REQUIRED_DOCUMENT_TYPES,
  EXPIRING_DOCUMENT_TYPES,
  DRIVER_DECISIONS,
  DRIVER_STATUS_FILTERS,
  todayIso,
  parseIsoDate,
  cleanNotes,
  latestDocumentsByType,
  verificationReadiness,
  credentialsCurrent,
};
