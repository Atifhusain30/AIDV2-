const { types } = require('pg');
const { estimateArrival } = require('./pricing');
const {
  ACTIVE_STATUSES: ACTIVE, EXPIRABLE, STALE_RELEASABLE, DEFAULT_REQUEST_EXPIRY_MINUTES, DEFAULT_STALE_JOB_MINUTES,
} = require('./lifecycle');
const { publicRating, RATING_WINDOW_DAYS, LOW_RATING_MAX_STARS } = require('./ratings');
const { categoryLabel, ADMIN_CATEGORY_LABELS } = require('./support');
const { OPEN_STATUSES: CHAT_OPEN_STATUSES, PAGE_SIZE: CHAT_PAGE_SIZE } = require('./chat');

// Keep SQL `date` values as YYYY-MM-DD strings; JS Date conversion shifts them by timezone.
types.setTypeParser(1082, (value) => value);

const ACTIVE_STATUSES = [...ACTIVE];
// The partial unique index that allows one active booking per customer (migration 20261022200000).
const ONE_ACTIVE_INDEX = 'bookings_one_active_per_customer';
// ...and one unfinished job per driver.
const ONE_JOB_PER_DRIVER_INDEX = 'bookings_one_active_job_per_driver';

// One rating per booking per rater (migration 20261023000000).
const RATING_UNIQUE = 'ratings_one_per_rater';
class RatingExistsError extends Error {
  constructor() { super('Already rated'); this.code = 'already_rated'; }
}

/** Thrown by createBooking when the customer already has an active booking (the unique index fired). */
class ActiveBookingExistsError extends Error {
  constructor() { super('Customer already has an active booking'); this.code = 'active_request_exists'; }
}
const ESTIMATED_TIMES = { battery_jump: 30, flat_tire: 35, towing: 60, lockout: 30, fuel_delivery: 35, ev_charging: 45, oil_change: 45, detailing: 120, window_tinting: 180 };

function dollars(cents) {
  return cents == null ? undefined : Number(cents) / 100;
}

// The driver's own service vehicle (driver_profiles.vehicle_*), as the driver sees and edits it.
function mapDriverVehicle(row) {
  if (!row || !row.vehicle_make) return null;
  return {
    make: row.vehicle_make, model: row.vehicle_model, year: row.vehicle_year ?? null, color: row.vehicle_color,
    plate: row.vehicle_plate, plateState: row.vehicle_plate_state || '', equipmentType: row.vehicle_equipment_type || '',
  };
}

function mapProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    status: row.status,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    createdAt: row.created_at,
    // B15: ratings this person received (the average only from MIN_RATINGS_TO_SHOW on; see ratings.js).
    ...publicRating(row.rating_avg, row.rating_count),
    ...(row.role === 'driver' ? {
      verificationStatus: row.verification_status,
      isVerified: row.verification_status === 'verified',
      credentialsValidUntil: row.credentials_valid_until || null,
      isOnline: row.is_online,
      totalJobs: row.completed_jobs || 0,
      specializations: row.specializations || [],
      driverVehicle: mapDriverVehicle(row),
    } : {}),
  };
}

function mapDriverDocument(row) {
  if (!row) return null;
  return {
    id: row.id,
    driverId: row.driver_id,
    type: row.document_type,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    status: row.status,
    expiresOn: row.expires_on || null,
    reviewNotes: row.review_notes || null,
    reviewedAt: row.reviewed_at || null,
    uploadedAt: row.created_at,
  };
}

function mapVerification(row) {
  if (!row) return null;
  return {
    status: row.verification_status,
    reviewNotes: row.review_notes || null,
    submittedAt: row.submitted_at || null,
    reviewedAt: row.reviewed_at || null,
    credentialsValidUntil: row.credentials_valid_until || null,
  };
}

const REVIEW_LIST_FILTERS = Object.freeze({
  all: 'true',
  needs_review: "(dp.verification_status = 'under_review' or exists (select 1 from public.driver_documents d where d.driver_id = p.id and d.status = 'pending'))",
  expiring: "dp.verification_status = 'verified' and dp.credentials_valid_until < current_date + 30",
  pending: "dp.verification_status = 'pending'",
  under_review: "dp.verification_status = 'under_review'",
  verified: "dp.verification_status = 'verified'",
  rejected: "dp.verification_status = 'rejected'",
  suspended: "dp.verification_status = 'suspended'",
});

function mapVehicle(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customer_id,
    make: row.make,
    model: row.model,
    year: row.year,
    color: row.color,
    licensePlate: row.license_plate,
    plate: row.license_plate,
    isElectric: row.is_electric,
    createdAt: row.created_at,
  };
}

function mapBooking(row) {
  if (!row) return null;
  const estimatedPrice = dollars(row.estimated_price_cents);
  const booking = {
    id: row.id,
    customerId: row.customer_id,
    driverId: row.driver_id || undefined,
    service: {
      id: row.service_type,
      name: row.service_name,
      description: '',
      basePrice: estimatedPrice,
      estimatedTime: ESTIMATED_TIMES[row.service_type] || 45,
    },
    status: row.status,
    location: { address: row.location_address, lat: row.location_lat, lng: row.location_lng },
    estimatedPrice,
    finalPrice: dollars(row.final_price_cents),
    notes: row.notes || undefined,
    payment: row.payment_intent_id ? {
      intentId: row.payment_intent_id,
      status: row.payment_status,
      amount: dollars(row.final_price_cents || row.estimated_price_cents),
    } : undefined,
    driverLocation: row.driver_lat == null ? undefined : { lat: row.driver_lat, lng: row.driver_lng },
    createdAt: row.created_at,
    acceptedAt: row.accepted_at || undefined,
    arrivedAt: row.arrived_at || undefined,
    startedAt: row.started_at || undefined,
    completedAt: row.completed_at || undefined,
    cancelledAt: row.cancelled_at || undefined,
    expiredAt: row.expired_at || undefined,
  };
  if (row.cancelled_by) booking.cancelledBy = row.cancelled_by;
  // Why the server ended it on its own (E4): 'no_driver_found' (expired) or 'driver_unresponsive'.
  if (row.system_end_reason) booking.endReason = row.system_end_reason;
  if (row.dropoff_address) booking.dropoffLocation = { address: row.dropoff_address, lat: row.dropoff_lat, lng: row.dropoff_lng };
  if (row.vehicle_id) booking.vehicle = { vehicleId: row.vehicle_id, label: row.vehicle_label || 'Saved vehicle', plate: row.vehicle_plate || undefined };
  if (row.customer_name != null) {
    booking.customerName = row.customer_name;
    booking.customerPhone = row.customer_phone || '';
  }
  return booking;
}

const iso = (value) => (value ? new Date(value).toISOString() : null);

// B18: a report as its sender sees it (never the admin trail).
function mapSupportReport(row) {
  if (!row) return null;
  return {
    id: row.id,
    category: row.category,
    categoryLabel: categoryLabel(row.reporter_role, row.category),
    message: row.message || '',
    status: row.status,
    booking: row.booking_id ? { id: row.booking_id, serviceName: row.service_name || 'Job' } : null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    resolvedAt: iso(row.resolved_at),
  };
}

// B18: a report in the admin inbox.
function mapAdminSupportReport(row) {
  return {
    id: row.id,
    reporterRole: row.reporter_role,
    reporterName: row.reporter_id ? `${row.reporter_first_name || ''} ${row.reporter_last_name || ''}`.trim() || 'Unnamed' : 'Deleted account',
    reporterEmail: row.reporter_email || '',
    category: row.category,
    categoryLabel: ADMIN_CATEGORY_LABELS[row.category] || row.category,
    isSafety: row.category === 'safety',
    message: row.message || '',
    status: row.status,
    booking: row.booking_id ? { id: row.booking_id, serviceName: row.service_name || 'Job', status: row.current_booking_status || null } : null,
    noteCount: row.note_count ?? undefined,
    fromJobIssue: row.source_event_id != null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    resolvedAt: iso(row.resolved_at),
  };
}

// Contact details and live location are shared only while a job is in progress.
const CONTACT_STATUSES = new Set(['accepted', 'en_route', 'arrived', 'in_progress']);
// The driver is still heading to the pickup in these statuses, so an arrival estimate makes sense.
const ETA_STATUSES = new Set(['accepted', 'en_route']);
const PARTY_SELECT = `
  select b.*, concat_ws(' ', v.year, v.make, v.model) as vehicle_label, v.license_plate as vehicle_plate, v.color as vehicle_color,
    c.first_name as party_customer_first_name, c.last_name as party_customer_last_name, c.phone as party_customer_phone,
    d.first_name as party_driver_first_name, d.last_name as party_driver_last_name, d.phone as party_driver_phone,
    dr.avg_stars as party_driver_rating_avg, dr.n as party_driver_rating_count, dj.n as party_driver_completed_jobs,
    cr.avg_stars as party_customer_rating_avg, cr.n as party_customer_rating_count,
    dp.vehicle_make as party_driver_vehicle_make, dp.vehicle_model as party_driver_vehicle_model,
    dp.vehicle_color as party_driver_vehicle_color, dp.vehicle_plate as party_driver_vehicle_plate,
    (select case when e.actor_id = b.customer_id then 'customer' when e.actor_id = b.driver_id then 'driver'
              when e.actor_id is null and e.metadata->>'role' = 'system' then 'system' else 'support' end
       from public.booking_events e where e.booking_id = b.id and e.to_status = 'cancelled' and e.event_type = 'status_changed'
       order by e.created_at desc limit 1) as cancelled_by,
    (select e.metadata->>'reason'
       from public.booking_events e where e.booking_id = b.id and e.to_status in ('cancelled','expired') and e.event_type = 'status_changed'
         and e.actor_id is null and e.metadata->>'role' = 'system'
       order by e.created_at desc limit 1) as system_end_reason
  from public.bookings b
  left join public.vehicles v on v.id = b.vehicle_id
  left join public.profiles c on c.id = b.customer_id
  left join public.profiles d on d.id = b.driver_id
  left join public.driver_profiles dp on dp.profile_id = b.driver_id
  left join lateral (select avg(r.stars) as avg_stars, count(*)::int as n from public.ratings r where r.ratee_id = b.driver_id) dr on true
  left join lateral (select count(*)::int as n from public.bookings x where x.driver_id = b.driver_id and x.status = 'completed') dj on true
  left join lateral (select avg(r.stars) as avg_stars, count(*)::int as n from public.ratings r where r.ratee_id = b.customer_id) cr on true`;

// Ratings a profile received (avg + count) and jobs completed as a driver. Both use indexes.
const PROFILE_RATING_COLUMNS = `
  (select avg(r.stars) from public.ratings r where r.ratee_id = p.id) as rating_avg,
  (select count(*)::int from public.ratings r where r.ratee_id = p.id) as rating_count,
  (select count(*)::int from public.bookings x where x.driver_id = p.id and x.status = 'completed') as completed_jobs`;

// B12: true when either of two people has blocked the other (both directions use an index).
const BLOCKED_BETWEEN = (a, b) => `exists (select 1 from public.user_blocks ub where (ub.blocker_id = ${a} and ub.blocked_id = ${b}) or (ub.blocker_id = ${b} and ub.blocked_id = ${a}))`;

// B12: a chat message as a participant sees it — whose it is (mine or theirs) and the sender's role,
// never an account id, name, phone or email.
function mapJobMessage(row, viewerId) {
  return {
    id: row.id,
    seq: String(row.seq),
    mine: row.sender_id === viewerId,
    senderRole: row.sender_role,
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
  };
}

const shortName = (first, last) => [first, last && last.trim() ? `${last.trim()[0].toUpperCase()}.` : ''].filter(Boolean).join(' ');

function mapParticipantBooking(row, role) {
  const booking = mapBooking(row);
  if (!booking) return null;
  const live = CONTACT_STATUSES.has(row.status);
  if (booking.vehicle && row.vehicle_color) booking.vehicle.color = row.vehicle_color;
  if (!live) delete booking.driverLocation;
  else if (booking.driverLocation && row.driver_location_at) booking.driverLocation.updatedAt = new Date(row.driver_location_at).toISOString();
  // Approximate ETA from the driver's last shared position to the pickup, until they arrive.
  if (live && booking.driverLocation && ETA_STATUSES.has(row.status) && Number.isFinite(booking.location.lat) && Number.isFinite(booking.location.lng)) {
    booking.driverEta = { ...estimateArrival(booking.driverLocation, booking.location), fromLocationAt: booking.driverLocation.updatedAt || null };
  }

  if ((role === 'customer' || role === 'admin') && row.driver_id && row.party_driver_first_name != null) {
    booking.driver = {
      id: row.driver_id,
      name: shortName(row.party_driver_first_name, row.party_driver_last_name),
      firstName: row.party_driver_first_name,
      ...(live && row.party_driver_phone ? { phone: row.party_driver_phone } : {}),
      // B15: the average only once there are enough ratings; comments are never included.
      ...publicRating(row.party_driver_rating_avg, row.party_driver_rating_count),
      totalJobs: row.party_driver_completed_jobs || 0,
      vehicle: row.party_driver_vehicle_make ? {
        make: row.party_driver_vehicle_make, model: row.party_driver_vehicle_model,
        color: row.party_driver_vehicle_color, plate: row.party_driver_vehicle_plate,
      } : null,
    };
  }
  if ((role === 'driver' || role === 'admin') && row.party_customer_first_name != null) {
    booking.customer = {
      name: shortName(row.party_customer_first_name, row.party_customer_last_name),
      firstName: row.party_customer_first_name,
      ...(live && row.party_customer_phone ? { phone: row.party_customer_phone } : {}),
      ...publicRating(row.party_customer_rating_avg, row.party_customer_rating_count),
    };
  }
  return booking;
}

class PostgresRepository {
  /**
   * `requestExpiryMinutes`: an unaccepted request expires this long after it was made.
   * `staleJobMinutes`: an accepted/en_route job is released after this long with no word from the driver.
   * (Both from expiryConfigFromEnv() in lifecycle.js.)
   */
  constructor(pool, { requestExpiryMinutes = DEFAULT_REQUEST_EXPIRY_MINUTES, staleJobMinutes = DEFAULT_STALE_JOB_MINUTES } = {}) {
    this.pool = pool;
    this.requestExpiryMinutes = requestExpiryMinutes;
    this.staleJobMinutes = staleJobMinutes;
  }

  // A participant's view of a booking, plus when an open request will expire.
  participant(row, role) {
    const booking = mapParticipantBooking(row, role);
    if (booking && EXPIRABLE.includes(booking.status)) {
      booking.expiresAt = new Date(new Date(row.created_at).getTime() + this.requestExpiryMinutes * 60000).toISOString();
    }
    return booking;
  }

  async getProfile(userId) {
    const result = await this.pool.query(`
      select p.*, dp.verification_status, dp.credentials_valid_until, dp.is_online, dp.specializations,
        dp.vehicle_make, dp.vehicle_model, dp.vehicle_year, dp.vehicle_color, dp.vehicle_plate, dp.vehicle_plate_state, dp.vehicle_equipment_type,
        ${PROFILE_RATING_COLUMNS}
      from public.profiles p left join public.driver_profiles dp on dp.profile_id = p.id
      where p.id = $1
    `, [userId]);
    return mapProfile(result.rows[0]);
  }

  async updateProfile(userId, patch) {
    const result = await this.pool.query(`
      update public.profiles set first_name = $2, last_name = $3, phone = $4
      where id = $1 returning id
    `, [userId, patch.firstName, patch.lastName, patch.phone]);
    // Re-read so the answer carries the same derived fields as GET /api/me (vehicle, ratings, job count).
    return result.rows[0] ? this.getProfile(userId) : null;
  }

  async listDriverDocuments(driverId) {
    const result = await this.pool.query('select * from public.driver_documents where driver_id=$1 order by created_at desc', [driverId]);
    return result.rows.map(mapDriverDocument);
  }

  async createDriverDocument(driverId, input) {
    const result = await this.pool.query(`
      insert into public.driver_documents (driver_id, document_type, storage_path, file_name, mime_type, file_size, expires_on)
      values ($1,$2,$3,$4,$5,$6,$7) returning *
    `, [driverId, input.type, input.storagePath, input.fileName, input.mimeType, input.fileSize, input.expiresOn || null]);
    return mapDriverDocument(result.rows[0]);
  }

  async getDriverDocument(driverId, documentId) {
    const result = await this.pool.query('select * from public.driver_documents where id=$2 and driver_id=$1', [driverId, documentId]);
    return mapDriverDocument(result.rows[0]);
  }

  async deleteDriverDocument(driverId, documentId) {
    const result = await this.pool.query('delete from public.driver_documents where id=$2 and driver_id=$1 returning storage_path', [driverId, documentId]);
    return result.rows[0]?.storage_path || null;
  }

  async transaction(work) {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await work(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async getDriverVerification(driverId) {
    const result = await this.pool.query('select * from public.driver_profiles where profile_id=$1', [driverId]);
    return mapVerification(result.rows[0]);
  }

  async submitDriverVerification(driverId) {
    return this.transaction(async (client) => {
      const result = await client.query(`
        update public.driver_profiles
        set verification_status='under_review', submitted_at=now(), review_notes=null, updated_at=now()
        where profile_id=$1 and verification_status in ('pending','rejected')
        returning *
      `, [driverId]);
      if (!result.rows[0]) return null;
      await client.query("insert into public.driver_verification_events (driver_id, actor_id, action) values ($1,$1,'submitted')", [driverId]);
      return mapVerification(result.rows[0]);
    });
  }

  async listDriversForReview(filter) {
    const condition = REVIEW_LIST_FILTERS[filter];
    if (!condition) throw new Error(`Unsupported review filter: ${filter}`);
    const result = await this.pool.query(`
      select p.id, p.first_name, p.last_name, p.phone, p.status as account_status, p.created_at, u.email,
             dp.verification_status, dp.submitted_at, dp.reviewed_at, dp.credentials_valid_until, dp.is_online,
             (select count(*)::int from public.driver_documents d where d.driver_id = p.id and d.status = 'pending') as pending_documents
      from public.profiles p
      join public.driver_profiles dp on dp.profile_id = p.id
      left join auth.users u on u.id = p.id
      where p.role = 'driver' and p.status <> 'deleted' and ${condition}
      order by dp.submitted_at asc nulls last, p.created_at asc
      limit 200
    `);
    return result.rows.map((row) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      email: row.email || '',
      accountStatus: row.account_status,
      verificationStatus: row.verification_status,
      submittedAt: row.submitted_at || null,
      reviewedAt: row.reviewed_at || null,
      credentialsValidUntil: row.credentials_valid_until || null,
      isOnline: row.is_online,
      pendingDocuments: row.pending_documents,
      createdAt: row.created_at,
    }));
  }

  async getDriverForReview(driverId) {
    const driver = await this.pool.query(`
      select p.*, u.email, dp.verification_status, dp.review_notes, dp.submitted_at, dp.reviewed_at,
             dp.credentials_valid_until, dp.is_online,
             (select count(*)::int from public.bookings x where x.driver_id = p.id and x.status = 'completed') as completed_jobs
      from public.profiles p
      join public.driver_profiles dp on dp.profile_id = p.id
      left join auth.users u on u.id = p.id
      where p.id = $1 and p.role = 'driver'
    `, [driverId]);
    const row = driver.rows[0];
    if (!row) return null;
    const [documents, events, ratings] = await Promise.all([
      this.listDriverDocuments(driverId),
      this.pool.query(`
        select e.*, a.first_name as actor_first_name, a.last_name as actor_last_name, a.role as actor_role
        from public.driver_verification_events e left join public.profiles a on a.id = e.actor_id
        where e.driver_id = $1 order by e.created_at desc limit 100
      `, [driverId]),
      this.getRatingsForAdmin(driverId),
    ]);
    return {
      driver: {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        phone: row.phone,
        email: row.email || '',
        accountStatus: row.status,
        createdAt: row.created_at,
        isOnline: row.is_online,
        rating: ratings.average,
        ratingCount: ratings.count,
        totalJobs: row.completed_jobs || 0,
        ...mapVerification(row),
        verificationStatus: row.verification_status,
      },
      documents,
      ratings,
      events: events.rows.map((event) => ({
        id: event.id,
        action: event.action,
        notes: event.notes || null,
        documentId: event.document_id || null,
        actor: event.actor_id ? { id: event.actor_id, name: `${event.actor_first_name || ''} ${event.actor_last_name || ''}`.trim(), role: event.actor_role } : null,
        createdAt: event.created_at,
      })),
    };
  }

  async getDocumentForReview(documentId) {
    const result = await this.pool.query('select * from public.driver_documents where id=$1', [documentId]);
    return mapDriverDocument(result.rows[0]);
  }

  async reviewDriverDocument(documentId, adminId, { status, notes, expiresOn }) {
    return this.transaction(async (client) => {
      const result = await client.query(`
        update public.driver_documents
        set status=$2, review_notes=$3, reviewed_by=$4, reviewed_at=now(), expires_on=coalesce($5::date, expires_on)
        where id=$1 returning *
      `, [documentId, status, notes || null, adminId, expiresOn || null]);
      const document = result.rows[0];
      if (!document) return null;
      await client.query(
        'insert into public.driver_verification_events (driver_id, actor_id, document_id, action, notes) values ($1,$2,$3,$4,$5)',
        [document.driver_id, adminId, documentId, status === 'approved' ? 'document_approved' : 'document_rejected', notes || null],
      );
      return mapDriverDocument(document);
    });
  }

  async applyDriverDecision(driverId, adminId, { fromStatuses, toStatus, event, notes, credentialsValidUntil }) {
    return this.transaction(async (client) => {
      const result = await client.query(`
        update public.driver_profiles
        set verification_status=$3, review_notes=$4, reviewed_at=now(), reviewed_by=$5,
            credentials_valid_until = case when $6::boolean then $7::date else credentials_valid_until end,
            is_online = case when $3 = 'verified' then is_online else false end,
            updated_at=now()
        where profile_id=$1 and verification_status = any($2::text[])
        returning *
      `, [driverId, fromStatuses, toStatus, notes || null, adminId, credentialsValidUntil !== undefined, credentialsValidUntil || null]);
      if (!result.rows[0]) return null;
      await client.query(
        'insert into public.driver_verification_events (driver_id, actor_id, action, notes) values ($1,$2,$3,$4)',
        [driverId, adminId, event, notes || null],
      );
      return mapVerification(result.rows[0]);
    });
  }

  async setCredentialsValidUntil(driverId, date) {
    await this.pool.query('update public.driver_profiles set credentials_valid_until=$2, updated_at=now() where profile_id=$1', [driverId, date]);
  }

  async prepareAccountDeletion(userId) {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const documents = await client.query('select storage_path from public.driver_documents where driver_id=$1', [userId]);
      await client.query('delete from public.bookings where customer_id=$1', [userId]);
      // Preserve customers' history when a driver leaves; return active jobs to dispatch.
      await client.query(`update public.bookings set driver_id=null, driver_lat=null, driver_lng=null,
        status = case when status in ('accepted','en_route','arrived','in_progress') then 'searching' else status end,
        accepted_at = case when status in ('accepted','en_route','arrived','in_progress') then null else accepted_at end,
        arrived_at = case when status in ('accepted','en_route','arrived','in_progress') then null else arrived_at end,
        started_at = case when status in ('accepted','en_route','arrived','in_progress') then null else started_at end,
        updated_at = now()
        where driver_id=$1`, [userId]);
      await client.query('delete from public.vehicles where customer_id=$1', [userId]);
      await client.query('delete from public.driver_documents where driver_id=$1', [userId]);
      await client.query('commit');
      return { storagePaths: documents.rows.map((row) => row.storage_path) };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async listVehicles(customerId) {
    const result = await this.pool.query('select * from public.vehicles where customer_id = $1 order by created_at desc', [customerId]);
    return result.rows.map(mapVehicle);
  }

  async getVehicle(customerId, vehicleId) {
    const result = await this.pool.query('select * from public.vehicles where id=$2 and customer_id=$1', [customerId, vehicleId]);
    return mapVehicle(result.rows[0]);
  }

  async createVehicle(customerId, input) {
    const result = await this.pool.query(`
      insert into public.vehicles (customer_id, make, model, year, color, license_plate, is_electric)
      values ($1,$2,$3,$4,$5,$6,$7) returning *
    `, [customerId, input.make, input.model, input.year, input.color, input.licensePlate, input.isElectric]);
    return mapVehicle(result.rows[0]);
  }

  async updateVehicle(customerId, vehicleId, input) {
    const result = await this.pool.query(`
      update public.vehicles set make=$3, model=$4, year=$5, color=$6, license_plate=$7, is_electric=$8
      where id=$2 and customer_id=$1 returning *
    `, [customerId, vehicleId, input.make, input.model, input.year, input.color, input.licensePlate, input.isElectric]);
    return mapVehicle(result.rows[0]);
  }

  async deleteVehicle(customerId, vehicleId) {
    const result = await this.pool.query('delete from public.vehicles where id=$2 and customer_id=$1 returning id', [customerId, vehicleId]);
    return result.rowCount > 0;
  }

  // One active booking per customer is guaranteed by the partial unique index: if two requests race,
  // exactly one insert lands and the other gets ActiveBookingExistsError (the API answers 409).
  async createBooking(input) {
    const dropoff = input.dropoffLocation;
    let result;
    try {
      result = await this.pool.query(`
        insert into public.bookings (
          customer_id, vehicle_id, service_type, service_name, location_address, location_lat, location_lng,
          dropoff_address, dropoff_lat, dropoff_lng, estimated_price_cents, notes
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *
      `, [
        input.customerId, input.vehicleId, input.service.id, input.service.name,
        input.location.address, input.location.lat, input.location.lng,
        dropoff?.address || null, dropoff?.lat ?? null, dropoff?.lng ?? null,
        Math.round(input.estimatedPrice * 100), input.notes,
      ]);
    } catch (error) {
      if (error?.code === '23505' && error.constraint === ONE_ACTIVE_INDEX) throw new ActiveBookingExistsError();
      throw error;
    }
    return this.participant(result.rows[0], 'customer');
  }

  async listBookings(userId, role) {
    const column = role === 'driver' ? 'b.driver_id' : 'b.customer_id';
    const result = await this.pool.query(`${PARTY_SELECT} where ${column}=$1 order by b.created_at desc limit 100`, [userId]);
    return result.rows.map((row) => this.participant(row, role));
  }

  async selectParticipantBooking(bookingId, role) {
    const result = await this.pool.query(`${PARTY_SELECT} where b.id=$1`, [bookingId]);
    return this.participant(result.rows[0], role);
  }

  async getBooking(bookingId, userId, role) {
    const condition = role === 'admin' ? 'true' : role === 'driver' ? 'b.driver_id=$2' : 'b.customer_id=$2';
    const result = await this.pool.query(`${PARTY_SELECT} where b.id=$1 and ${condition}`, [bookingId, userId]);
    return this.participant(result.rows[0], role);
  }

  async getActiveBooking(userId, role) {
    const column = role === 'driver' ? 'b.driver_id' : 'b.customer_id';
    const result = await this.pool.query(`${PARTY_SELECT} where ${column}=$1 and b.status=any($2::text[]) order by b.created_at desc limit 1`, [userId, ACTIVE_STATUSES]);
    return this.participant(result.rows[0], role);
  }

  /** Just the status of any booking (to explain a refused accept), or null when it doesn't exist. */
  async getBookingStatus(bookingId) {
    const result = await this.pool.query('select status from public.bookings where id=$1', [bookingId]);
    return result.rows[0]?.status || null;
  }

  /**
   * E4: end stale work, each change audited (actor null, role 'system') in the same statement.
   *   • pending/searching older than requestExpiryMinutes → 'expired' (reason no_driver_found)
   *   • accepted/en_route whose driver has been silent for staleJobMinutes → 'cancelled' (reason
   *     driver_unresponsive). Silent = the later of acceptance, the last shared location and the last
   *     status change is older than the window.
   * Optional scope (customerId / driverId / bookingId) keeps the lazy checks on reads cheap; the
   * interval sweep passes none. Row locks make this safe against a concurrent accept or status change:
   * whichever commits first wins and the other re-checks its WHERE clause.
   * Returns { expired, released } (booking ids).
   */
  async expireStaleBookings({ customerId = null, driverId = null, bookingId = null } = {}) {
    const result = await this.pool.query(`
      with open_prev as (
        select b.id, b.status from public.bookings b
        where b.status = any($4::text[]) and b.created_at <= now() - make_interval(mins => $6::int)
          and ($1::uuid is null or b.customer_id=$1) and ($2::uuid is null or b.driver_id=$2) and ($3::uuid is null or b.id=$3)
        for update skip locked
      ), expired as (
        update public.bookings b set status='expired', expired_at=now()
        from open_prev p where b.id=p.id
        returning b.id, p.status as from_status
      ), stale_prev as (
        select b.id, b.status from public.bookings b
        where b.status = any($5::text[]) and b.driver_id is not null
          and ($1::uuid is null or b.customer_id=$1) and ($2::uuid is null or b.driver_id=$2) and ($3::uuid is null or b.id=$3)
          and greatest(b.accepted_at, b.driver_location_at,
                (select max(e.created_at) from public.booking_events e where e.booking_id=b.id and e.event_type='status_changed'))
              <= now() - make_interval(mins => $7::int)
        for update of b skip locked
      ), released as (
        update public.bookings b set status='cancelled', cancelled_at=now(), driver_lat=null, driver_lng=null
        from stale_prev p where b.id=p.id
        returning b.id, p.status as from_status
      ), ev as (
        insert into public.booking_events (booking_id, actor_id, event_type, from_status, to_status, metadata)
        select id, null::uuid, 'status_changed', from_status, 'expired',
               jsonb_build_object('role', 'system', 'reason', 'no_driver_found', 'afterMinutes', $6::int) from expired
        union all
        select id, null::uuid, 'status_changed', from_status, 'cancelled',
               jsonb_build_object('role', 'system', 'reason', 'driver_unresponsive', 'afterMinutes', $7::int) from released
      )
      select 'expired' as kind, id from expired union all select 'released', id from released
    `, [customerId, driverId, bookingId, [...EXPIRABLE], [...STALE_RELEASABLE], this.requestExpiryMinutes, this.staleJobMinutes]);
    return {
      expired: result.rows.filter((row) => row.kind === 'expired').map((row) => row.id),
      released: result.rows.filter((row) => row.kind === 'released').map((row) => row.id),
    };
  }

  /**
   * Open requests this driver's equipment can perform. `capability` comes from
   * equipmentCapability() in driverVehicle.js; without one, nothing is returned (fail closed).
   * `area` is a lat/lng box around the driver (nearby.js boundingBox); candidates are returned
   * roughly nearest first with their exact `pickup` so the API can compute the real distance,
   * filter to the radius and cap the list. Without an area nothing is returned (fail closed).
   */
  async listAvailableBookings({ serviceTypes = [], electricTowing = false } = {}, area = null, driverId = null) {
    if (!area) return [];
    const center = { lat: (area.minLat + area.maxLat) / 2, lng: (area.minLng + area.maxLng) / 2 };
    const result = await this.pool.query(`
      select b.*, concat_ws(' ', v.year, v.make, v.model) as vehicle_label, v.license_plate as vehicle_plate
      from public.bookings b left join public.vehicles v on v.id=b.vehicle_id
      where b.status='searching' and b.driver_id is null
        and b.created_at > now() - make_interval(mins => $9::int)
        and b.service_type = any($1::text[])
        and ($2::boolean or b.service_type <> 'towing' or not coalesce(v.is_electric, false))
        and b.location_lat between $3 and $4 and b.location_lng between $5 and $6
        and ($10::uuid is null or not ${BLOCKED_BETWEEN('b.customer_id', '$10::uuid')})
      order by power(b.location_lat - $7, 2) + power((b.location_lng - $8) * cos(radians($7)), 2), b.created_at asc
      limit 500
    `, [serviceTypes, electricTowing, area.minLat, area.maxLat, area.minLng, area.maxLng, center.lat, center.lng, this.requestExpiryMinutes, driverId]);
    return result.rows.map((row) => {
      const booking = mapBooking(row);
      booking.pickup = { lat: row.location_lat, lng: row.location_lng };
      // Requests past their expiry window are never listed, even before the sweep marks them expired.
      booking.expiresAt = new Date(new Date(row.created_at).getTime() + this.requestExpiryMinutes * 60000);
      delete booking.customerName;
      delete booking.customerPhone;
      delete booking.customerId;
      delete booking.dropoffLocation;
      delete booking.notes;
      if (booking.vehicle) delete booking.vehicle.plate;
      booking.location = {
        address: 'Approximate pickup area',
        lat: Math.round(booking.location.lat * 100) / 100,
        lng: Math.round(booking.location.lng * 100) / 100,
      };
      return booking;
    });
  }

  // What an accept checks the driver's equipment against: the service and whether the customer's
  // car is electric. Only for requests still open to any driver.
  async getAvailableBooking(bookingId) {
    const result = await this.pool.query(`
      select b.id, b.customer_id, b.service_type, b.location_lat, b.location_lng, coalesce(v.is_electric, false) as vehicle_is_electric
      from public.bookings b left join public.vehicles v on v.id=b.vehicle_id
      where b.id=$1 and b.status='searching' and b.driver_id is null
        and b.created_at > now() - make_interval(mins => $2::int)
    `, [bookingId, this.requestExpiryMinutes]);
    const row = result.rows[0];
    return row ? {
      id: row.id, customerId: row.customer_id, serviceType: row.service_type, vehicleIsElectric: Boolean(row.vehicle_is_electric),
      pickup: { lat: row.location_lat, lng: row.location_lng },
    } : null;
  }

  /** The driver's last reported position, if reported within `maxAgeMinutes`. */
  async getDriverPosition(driverId, maxAgeMinutes) {
    const result = await this.pool.query(`
      select current_lat, current_lng, current_location_at from public.driver_profiles
      where profile_id=$1 and current_lat is not null and current_lng is not null
        and current_location_at > now() - make_interval(mins => $2::int)
    `, [driverId, maxAgeMinutes]);
    const row = result.rows[0];
    return row ? { lat: row.current_lat, lng: row.current_lng, at: row.current_location_at } : null;
  }

  async updateDriverPosition(driverId, position) {
    await this.pool.query('update public.driver_profiles set current_lat=$2, current_lng=$3, current_location_at=now() where profile_id=$1',
      [driverId, position.lat, position.lng]);
  }

  // One job at a time: a driver with an unfinished job cannot accept another. The accept is
  // recorded in the booking's audit trail in the same statement. The equipment rules are repeated
  // in the update itself (same as listAvailableBookings), so an incompatible accept can never land.
  // The unique index on driver_id backs the NOT EXISTS check up: if two accepts by the same driver
  // race, the loser gets a unique violation, treated as "not accepted" (the API explains why).
  async acceptBooking(bookingId, driverId, { serviceTypes = [], electricTowing = false } = {}) {
    let result;
    try {
      result = await this.acceptBookingQuery(bookingId, driverId, serviceTypes, electricTowing);
    } catch (error) {
      if (error?.code === '23505' && error.constraint === ONE_JOB_PER_DRIVER_INDEX) return null;
      throw error;
    }
    return result.rows[0] ? this.selectParticipantBooking(result.rows[0].id, 'driver') : null;
  }

  acceptBookingQuery(bookingId, driverId, serviceTypes, electricTowing) {
    return this.pool.query(`
      with upd as (
        update public.bookings b set driver_id=$2, status='accepted', accepted_at=now()
        where b.id=$1 and b.status = 'searching' and b.driver_id is null
          and b.created_at > now() - make_interval(mins => $6::int)
          and not exists (select 1 from public.bookings o where o.driver_id=$2 and o.status = any($3::text[]))
          and b.service_type = any($4::text[])
          and ($5::boolean or b.service_type <> 'towing'
            or not exists (select 1 from public.vehicles v where v.id = b.vehicle_id and v.is_electric))
          and not ${BLOCKED_BETWEEN('b.customer_id', '$2::uuid')}
        returning b.id
      ), ev as (
        insert into public.booking_events (booking_id, actor_id, event_type, from_status, to_status, metadata)
        select id, $2, 'status_changed', 'searching', 'accepted', '{"role":"driver"}'::jsonb from upd
      )
      select id from upd
    `, [bookingId, driverId, [...CONTACT_STATUSES], serviceTypes, electricTowing, this.requestExpiryMinutes]);
  }

  /**
   * Compare-and-set status change (only from `allowedCurrentStatuses`, only by the booking's own
   * customer/driver), stamping the matching *_at column and writing an audit event atomically.
   * Ending a job (completed/cancelled) clears the driver's last shared position on the booking.
   */
  async updateBookingStatus(bookingId, actorId, role, nextStatus, allowedCurrentStatuses, { reason = null } = {}) {
    const ownership = role === 'customer' ? 'customer_id=$2' : 'driver_id=$2';
    const result = await this.pool.query(`
      with prev as (
        select id, status from public.bookings
        where id=$1 and ${ownership} and status=any($4::text[]) for update
      ), upd as (
        update public.bookings b set status=$3,
          arrived_at=case when $3='arrived' then now() else b.arrived_at end,
          started_at=case when $3='in_progress' then now() else b.started_at end,
          completed_at=case when $3='completed' then now() else b.completed_at end,
          cancelled_at=case when $3='cancelled' then now() else b.cancelled_at end,
          driver_lat=case when $3 in ('completed','cancelled') then null else b.driver_lat end,
          driver_lng=case when $3 in ('completed','cancelled') then null else b.driver_lng end
        from prev where b.id=prev.id
        returning b.id, prev.status as from_status
      ), ev as (
        insert into public.booking_events (booking_id, actor_id, event_type, from_status, to_status, metadata)
        select id, $2, 'status_changed', from_status, $3, $5::jsonb from upd
      )
      select id from upd
    `, [bookingId, actorId, nextStatus, allowedCurrentStatuses, JSON.stringify(reason ? { role, reason } : { role })]);
    return result.rows[0] ? this.selectParticipantBooking(result.rows[0].id, role) : null;
  }

  /**
   * B15: store a rating. The insert itself re-checks the rules the API already applied — completed
   * booking, rater and ratee are its customer and driver, inside the window — so a rating can never
   * land outside them; returns null when they don't hold. A second rating by the same person for the
   * same booking violates the unique constraint: RatingExistsError.
   */
  async createRating({ bookingId, raterId, raterRole, rateeId, stars, comment, tags }, windowDays = RATING_WINDOW_DAYS) {
    let result;
    try {
      result = await this.pool.query(`
        insert into public.ratings (booking_id, rater_id, rater_role, ratee_id, stars, comment, tags)
        select b.id, $2::uuid, $3::text, $4::uuid, $5::smallint, $6::text, $7::text[]
        from public.bookings b
        where b.id = $1 and b.status = 'completed' and b.completed_at > now() - make_interval(days => $8::int)
          and case when $3::text = 'customer' then b.customer_id = $2::uuid and b.driver_id = $4::uuid
                   else b.driver_id = $2::uuid and b.customer_id = $4::uuid end
        returning booking_id, rater_role, stars, tags, created_at
      `, [bookingId, raterId, raterRole, rateeId, stars, comment, tags, windowDays]);
    } catch (error) {
      if (error?.code === '23505' && error.constraint === RATING_UNIQUE) throw new RatingExistsError();
      throw error;
    }
    const row = result.rows[0];
    return row ? { bookingId: row.booking_id, role: row.rater_role, stars: row.stars, tags: row.tags, createdAt: new Date(row.created_at).toISOString() } : null;
  }

  /** Has this person already rated this booking? */
  async hasRated(bookingId, raterId) {
    const result = await this.pool.query('select 1 from public.ratings where booking_id=$1 and rater_id=$2', [bookingId, raterId]);
    return result.rowCount > 0;
  }

  /**
   * Completed jobs this person can still rate (inside the window, the other person still on the job,
   * not yet rated by them), newest first.
   */
  async listPendingRatings(userId, role, windowDays = RATING_WINDOW_DAYS) {
    const mine = role === 'driver' ? 'b.driver_id' : 'b.customer_id';
    const theirs = role === 'driver' ? 'b.customer_id' : 'b.driver_id';
    const result = await this.pool.query(`
      select b.id, b.service_name, b.completed_at, o.first_name as ratee_first_name
      from public.bookings b
      join public.profiles o on o.id = ${theirs}
      where ${mine} = $1 and b.status = 'completed' and ${theirs} is not null and ${theirs} <> $1
        and b.completed_at > now() - make_interval(days => $2::int)
        and not exists (select 1 from public.ratings r where r.booking_id = b.id and r.rater_id = $1)
      order by b.completed_at desc
      limit 10
    `, [userId, windowDays]);
    return result.rows.map((row) => ({
      bookingId: row.id, serviceName: row.service_name, completedAt: new Date(row.completed_at).toISOString(),
      rateeFirstName: row.ratee_first_name || '',
    }));
  }

  /** Admin view of the ratings a person received: true average (2 decimals), count, recent low ones with comments. */
  async getRatingsForAdmin(rateeId) {
    const [summary, low] = await Promise.all([
      this.pool.query('select round(avg(stars)::numeric, 2) as average, count(*)::int as n from public.ratings where ratee_id=$1', [rateeId]),
      this.pool.query(`
        select r.booking_id, r.stars, r.comment, r.tags, r.created_at, b.service_name, c.first_name as rater_first_name
        from public.ratings r
        join public.bookings b on b.id = r.booking_id
        left join public.profiles c on c.id = r.rater_id
        where r.ratee_id = $1 and r.stars <= $2
        order by r.created_at desc limit 10
      `, [rateeId, LOW_RATING_MAX_STARS]),
    ]);
    const row = summary.rows[0] || {};
    return {
      average: row.average == null ? null : Number(row.average),
      count: row.n || 0,
      lowRatingMaxStars: LOW_RATING_MAX_STARS,
      recentLow: low.rows.map((item) => ({
        bookingId: item.booking_id, stars: item.stars, comment: item.comment || null, tags: item.tags || [],
        serviceName: item.service_name, raterFirstName: item.rater_first_name || '', createdAt: new Date(item.created_at).toISOString(),
      })),
    };
  }

  // ---- B18: support reports (rules in support.js) ----

  /** Reports this person sent in the last `minutes` (rate limit). */
  async countRecentSupportReports(reporterId, minutes = 60) {
    const result = await this.pool.query(
      'select count(*)::int as n from public.support_reports where reporter_id=$1 and created_at > now() - make_interval(mins => $2::int)',
      [reporterId, minutes],
    );
    return result.rows[0].n;
  }

  /**
   * Save a report. A job-linked one also leaves an 'issue_reported' event on the job's audit trail
   * (metadata.reportId points here; the message itself is only stored on the report).
   */
  async createSupportReport({ reporterId, role, bookingId = null, bookingStatus = null, category, message }) {
    const result = await this.pool.query(`
      with ins as (
        insert into public.support_reports (reporter_id, reporter_role, booking_id, booking_status, category, message)
        values ($1, $2, $3, $4, $5, $6)
        returning *
      ), ev as (
        insert into public.booking_events (booking_id, actor_id, event_type, from_status, to_status, metadata)
        select booking_id, reporter_id, 'issue_reported', booking_status, booking_status,
          jsonb_build_object('role', reporter_role, 'category', category, 'reportId', id)
        from ins where booking_id is not null
      )
      select ins.*, b.service_name from ins left join public.bookings b on b.id = ins.booking_id
    `, [reporterId, role, bookingId, bookingStatus, category, message]);
    return mapSupportReport(result.rows[0]);
  }

  /** The signed-in person's own reports, newest first (no admin notes). */
  async listMySupportReports(reporterId) {
    const result = await this.pool.query(`
      select r.*, b.service_name from public.support_reports r
      left join public.bookings b on b.id = r.booking_id
      where r.reporter_id = $1 order by r.created_at desc limit 50
    `, [reporterId]);
    return result.rows.map(mapSupportReport);
  }

  /** Admin inbox: reports in `statuses` (optionally one category), plus counts per status. */
  async listSupportReportsForAdmin({ statuses, category = null }) {
    const [list, counts] = await Promise.all([
      this.pool.query(`
        select r.*, b.service_name, b.status as current_booking_status,
          p.first_name as reporter_first_name, p.last_name as reporter_last_name, u.email as reporter_email,
          (select count(*)::int from public.support_report_events e where e.report_id = r.id and e.action = 'note_added') as note_count
        from public.support_reports r
        left join public.bookings b on b.id = r.booking_id
        left join public.profiles p on p.id = r.reporter_id
        left join auth.users u on u.id = r.reporter_id
        where r.status = any($1::text[]) and ($2::text is null or r.category = $2)
        order by (r.category = 'safety' and r.status <> 'resolved') desc, r.created_at desc
        limit 200
      `, [statuses, category]),
      this.pool.query(`
        select status, count(*)::int as n, count(*) filter (where category = 'safety')::int as safety
        from public.support_reports group by status
      `),
    ]);
    const byStatus = { open: 0, in_review: 0, resolved: 0, safetyActive: 0 };
    for (const row of counts.rows) {
      byStatus[row.status] = row.n;
      if (row.status !== 'resolved') byStatus.safetyActive += row.safety;
    }
    return { reports: list.rows.map(mapAdminSupportReport), counts: byStatus };
  }

  async getSupportReportStatus(reportId) {
    const result = await this.pool.query('select status from public.support_reports where id=$1', [reportId]);
    return result.rows[0]?.status ?? null;
  }

  /** Admin detail: the report, who sent it, the linked job with both parties, and the triage trail. */
  async getSupportReportForAdmin(reportId) {
    const result = await this.pool.query(`
      select r.*, b.service_name, b.status as current_booking_status,
        p.first_name as reporter_first_name, p.last_name as reporter_last_name, p.phone as reporter_phone, u.email as reporter_email,
        rb.first_name as resolver_first_name, rb.last_name as resolver_last_name,
        (select count(*)::int from public.support_reports o where o.reporter_id = r.reporter_id and o.id <> r.id) as other_reports
      from public.support_reports r
      left join public.bookings b on b.id = r.booking_id
      left join public.profiles p on p.id = r.reporter_id
      left join auth.users u on u.id = r.reporter_id
      left join public.profiles rb on rb.id = r.resolved_by
      where r.id = $1
    `, [reportId]);
    const row = result.rows[0];
    if (!row) return null;
    const [events, booking] = await Promise.all([
      this.pool.query(`
        select e.*, a.first_name, a.last_name, a.role from public.support_report_events e
        left join public.profiles a on a.id = e.actor_id
        where e.report_id = $1 order by e.created_at desc, e.id desc
      `, [reportId]),
      row.booking_id ? this.pool.query(`
        select b.id, b.service_name, b.status, b.location_address, b.dropoff_address, b.estimated_price_cents, b.final_price_cents,
          b.created_at, b.accepted_at, b.completed_at, b.cancelled_at, b.expired_at,
          b.customer_id, c.first_name as c_first, c.last_name as c_last, c.phone as c_phone, cu.email as c_email,
          b.driver_id, d.first_name as d_first, d.last_name as d_last, d.phone as d_phone, du.email as d_email
        from public.bookings b
        left join public.profiles c on c.id = b.customer_id left join auth.users cu on cu.id = b.customer_id
        left join public.profiles d on d.id = b.driver_id left join auth.users du on du.id = b.driver_id
        where b.id = $1
      `, [row.booking_id]) : Promise.resolve({ rows: [] }),
    ]);
    const job = booking.rows[0];
    const party = (id, first, last, email, phone) => (id ? { id, name: `${first || ''} ${last || ''}`.trim() || 'Unnamed', email: email || '', phone: phone || '' } : null);
    return {
      ...mapAdminSupportReport(row),
      reporter: row.reporter_id ? { ...party(row.reporter_id, row.reporter_first_name, row.reporter_last_name, row.reporter_email, row.reporter_phone), role: row.reporter_role, otherReports: row.other_reports } : null,
      resolvedBy: row.resolved_by ? { id: row.resolved_by, name: `${row.resolver_first_name || ''} ${row.resolver_last_name || ''}`.trim() } : null,
      booking: job ? {
        id: job.id, serviceName: job.service_name, status: job.status, statusWhenReported: row.booking_status || null,
        address: job.location_address, dropoffAddress: job.dropoff_address || null,
        price: dollars(job.final_price_cents ?? job.estimated_price_cents) ?? null,
        createdAt: job.created_at, acceptedAt: job.accepted_at || null, completedAt: job.completed_at || null,
        cancelledAt: job.cancelled_at || null, expiredAt: job.expired_at || null,
        customer: party(job.customer_id, job.c_first, job.c_last, job.c_email, job.c_phone),
        driver: party(job.driver_id, job.d_first, job.d_last, job.d_email, job.d_phone),
      } : null,
      events: events.rows.map((event) => ({
        id: String(event.id), action: event.action, fromStatus: event.from_status || null, toStatus: event.to_status || null, note: event.note || null,
        actor: event.actor_id ? { id: event.actor_id, name: `${event.first_name || ''} ${event.last_name || ''}`.trim(), role: event.role } : null,
        createdAt: new Date(event.created_at).toISOString(),
      })),
    };
  }

  /**
   * Admin status change and/or internal note, in one statement. The status change is a compare-and-set
   * on `fromStatus` (the status the API validated), so a concurrent change returns null instead of
   * skipping a rule. A note alone always applies.
   */
  async updateSupportReport(reportId, adminId, { fromStatus, status = null, note = null }) {
    const result = await this.pool.query(`
      with upd as (
        update public.support_reports r set
          status = coalesce($3::text, r.status),
          resolved_at = case when $3::text = 'resolved' then now() when $3::text is null then r.resolved_at else null end,
          resolved_by = case when $3::text = 'resolved' then $2::uuid when $3::text is null then r.resolved_by else null end,
          updated_at = now()
        where r.id = $1::uuid and r.status = $4::text
        returning r.id
      ), st as (
        insert into public.support_report_events (report_id, actor_id, action, from_status, to_status)
        select id, $2::uuid, 'status_changed', $4::text, $3::text from upd where $3::text is not null
      ), nt as (
        insert into public.support_report_events (report_id, actor_id, action, note)
        select id, $2::uuid, 'note_added', $5::text from upd where $5::text is not null
      )
      select id from upd
    `, [reportId, adminId, status, fromStatus, note]);
    return result.rows[0] ? this.getSupportReportForAdmin(result.rows[0].id) : null;
  }

  // ---- B12: job chat and blocks (rules in chat.js) ----

  /** Has either person blocked the other? { byMe, byThem } from `userId`'s side. */
  async getBlockBetween(userId, otherId) {
    if (!userId || !otherId) return { byMe: false, byThem: false };
    const result = await this.pool.query(`
      select coalesce(bool_or(blocker_id = $1::uuid), false) as by_me, coalesce(bool_or(blocker_id = $2::uuid), false) as by_them
      from public.user_blocks
      where (blocker_id = $1::uuid and blocked_id = $2::uuid) or (blocker_id = $2::uuid and blocked_id = $1::uuid)
    `, [userId, otherId]);
    const row = result.rows[0] || {};
    return { byMe: Boolean(row.by_me), byThem: Boolean(row.by_them) };
  }

  /**
   * What the apps need about a job's chat with every booking poll, in one query: messages from the
   * other person not yet read by `userId`, and whether either has blocked the other.
   */
  async getChatSummary(bookingId, userId, otherId) {
    const result = await this.pool.query(`
      select (select count(*)::int from public.job_messages m
               where m.booking_id = $1::uuid and m.read_at is null and m.sender_id is distinct from $2::uuid) as unread,
        exists (select 1 from public.user_blocks where blocker_id = $2::uuid and blocked_id = $3::uuid) as by_me,
        exists (select 1 from public.user_blocks where blocker_id = $3::uuid and blocked_id = $2::uuid) as by_them
    `, [bookingId, userId, otherId]);
    const row = result.rows[0] || {};
    return { unread: row.unread || 0, block: { byMe: Boolean(row.by_me), byThem: Boolean(row.by_them) } };
  }

  /** Messages of a job in order: the newest page first time (`after` null), then everything after the cursor. */
  async listJobMessages(bookingId, viewerId, after = null, limit = CHAT_PAGE_SIZE) {
    const result = after === null
      ? await this.pool.query(`
          select * from (select * from public.job_messages where booking_id = $1 order by seq desc limit $2) newest order by seq asc
        `, [bookingId, limit])
      : await this.pool.query(`
          select * from public.job_messages where booking_id = $1 and seq > $2::bigint order by seq asc limit $3
        `, [bookingId, after, limit]);
    return result.rows.map((row) => mapJobMessage(row, viewerId));
  }

  /** Messages this person sent in the last `seconds` (rate limit). */
  async countRecentJobMessages(senderId, seconds = 60) {
    const result = await this.pool.query(
      'select count(*)::int as n from public.job_messages where sender_id = $1 and created_at > now() - make_interval(secs => $2::int)',
      [senderId, seconds],
    );
    return result.rows[0].n;
  }

  /**
   * Store a message. The insert re-checks what the API already decided — the sender is this job's
   * customer or driver, a driver is assigned, the job is open for chat, nobody blocked anybody — and
   * locks the booking row so one job's messages get their seq in commit order (the polling cursor
   * never skips one). A retry with the same clientId returns the first message (`duplicate: true`).
   * Returns null when the rules no longer hold (e.g. the job ended a moment ago).
   */
  async createJobMessage({ bookingId, senderId, senderRole, body, clientId = null }) {
    const ownership = senderRole === 'driver' ? 'b.driver_id = $2::uuid' : 'b.customer_id = $2::uuid';
    const other = senderRole === 'driver' ? 'b.customer_id' : 'b.driver_id';
    const result = await this.pool.query(`
      with b as (
        select b.id from public.bookings b
        where b.id = $1::uuid and ${ownership} and ${other} is not null and b.status = any($6::text[])
          and not ${BLOCKED_BETWEEN(other, '$2::uuid')}
        for update of b
      ), ins as (
        insert into public.job_messages (booking_id, sender_id, sender_role, body, client_id)
        select b.id, $2::uuid, $3::text, $4::text, $5::text from b
        on conflict (sender_id, client_id) where client_id is not null do nothing
        returning *
      )
      select ins.*, false as duplicate from ins
      union all
      select m.*, true as duplicate from public.job_messages m
        where $5::text is not null and m.sender_id = $2::uuid and m.client_id = $5::text and m.booking_id = $1::uuid
          and not exists (select 1 from ins)
    `, [bookingId, senderId, senderRole, body, clientId, [...CHAT_OPEN_STATUSES]]);
    const row = result.rows[0];
    return row ? { message: mapJobMessage(row, senderId), duplicate: Boolean(row.duplicate) } : null;
  }

  /** Mark the other person's messages up to `upTo` (or all) as read by `readerId`. Returns how many changed. */
  async markJobMessagesRead(bookingId, readerId, upTo = null) {
    const result = await this.pool.query(`
      update public.job_messages set read_at = now()
      where booking_id = $1::uuid and read_at is null and sender_id is distinct from $2::uuid and ($3::bigint is null or seq <= $3::bigint)
    `, [bookingId, readerId, upTo]);
    return result.rowCount;
  }

  /**
   * `blockerId` blocks `blockedId` from this job. Idempotent (one row per pair); the first block is
   * recorded on the job's audit trail ('user_blocked'). Returns { created }.
   */
  async blockUser({ blockerId, blockerRole, blockedId, bookingId, bookingStatus }) {
    const result = await this.pool.query(`
      with ins as (
        insert into public.user_blocks (blocker_id, blocked_id, blocker_role, booking_id)
        values ($1::uuid, $2::uuid, $3::text, $4::uuid)
        on conflict (blocker_id, blocked_id) do nothing
        returning booking_id
      ), ev as (
        insert into public.booking_events (booking_id, actor_id, event_type, from_status, to_status, metadata)
        select booking_id, $1::uuid, 'user_blocked', $5::text, $5::text, jsonb_build_object('role', $3::text) from ins
      )
      select count(*)::int as n from ins
    `, [blockerId, blockedId, blockerRole, bookingId, bookingStatus]);
    return { created: result.rows[0].n > 0 };
  }

  /**
   * Admin: the whole chat of the job a report is about (also after the apps stop showing it), with who
   * sent each message, and any blocks between the two people. Null when the report has no job.
   */
  async getReportChatForAdmin(reportId) {
    const job = await this.pool.query(`
      select b.id, b.customer_id, b.driver_id from public.support_reports r join public.bookings b on b.id = r.booking_id where r.id = $1
    `, [reportId]);
    const booking = job.rows[0];
    if (!booking) return null;
    const [messages, blocks] = await Promise.all([
      this.pool.query(`
        select m.*, p.first_name, p.last_name from public.job_messages m left join public.profiles p on p.id = m.sender_id
        where m.booking_id = $1 order by m.seq asc limit 2000
      `, [booking.id]),
      booking.driver_id ? this.pool.query(`
        select ub.*, p.first_name, p.last_name from public.user_blocks ub left join public.profiles p on p.id = ub.blocker_id
        where (ub.blocker_id = $1 and ub.blocked_id = $2) or (ub.blocker_id = $2 and ub.blocked_id = $1)
        order by ub.created_at
      `, [booking.customer_id, booking.driver_id]) : Promise.resolve({ rows: [] }),
    ]);
    const name = (row) => `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unnamed';
    return {
      bookingId: booking.id,
      messages: messages.rows.map((row) => ({
        id: row.id, senderRole: row.sender_role, senderName: row.sender_id ? name(row) : 'Deleted account', body: row.body,
        createdAt: new Date(row.created_at).toISOString(), readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
      })),
      blocks: blocks.rows.map((row) => ({
        blockerRole: row.blocker_role, blockerName: name(row), sameJob: row.booking_id === booking.id,
        createdAt: new Date(row.created_at).toISOString(),
      })),
    };
  }

  async updateDriverOnlineStatus(driverId, isOnline) {
    // Going offline forgets the driver's position: it's only kept while they're available for work.
    const result = await this.pool.query(`
      update public.driver_profiles set is_online=$2,
        current_lat = case when $2 then current_lat end, current_lng = case when $2 then current_lng end,
        current_location_at = case when $2 then current_location_at end
      where profile_id=$1 returning *`, [driverId, isOnline]);
    return result.rows[0] || null;
  }

  async updateDriverLocation(bookingId, driverId, location) {
    const result = await this.pool.query(`
      update public.bookings set driver_lat=$3, driver_lng=$4, driver_location_at = now()
      where id=$1 and driver_id=$2 and status = any($5::text[]) returning id
    `, [bookingId, driverId, location.lat, location.lng, [...CONTACT_STATUSES]]);
    if (!result.rows[0]) return null;
    await this.updateDriverPosition(driverId, location);
    return this.selectParticipantBooking(result.rows[0].id, 'driver');
  }

  async updateDriverVehicle(driverId, vehicle) {
    const result = await this.pool.query(`
      update public.driver_profiles set vehicle_make=$2, vehicle_model=$3, vehicle_year=$4, vehicle_color=$5, vehicle_plate=$6,
        vehicle_plate_state=$7, vehicle_equipment_type=$8, updated_at=now()
      where profile_id=$1
      returning vehicle_make, vehicle_model, vehicle_year, vehicle_color, vehicle_plate, vehicle_plate_state, vehicle_equipment_type
    `, [driverId, vehicle.make, vehicle.model, vehicle.year, vehicle.color, vehicle.plate, vehicle.plateState, vehicle.equipmentType]);
    return mapDriverVehicle(result.rows[0]);
  }

  async setPaymentIntent(bookingId, customerId, paymentIntentId) {
    const result = await this.pool.query(`
      update public.bookings
      set payment_intent_id=$3,
          payment_status=case when payment_status='succeeded' then payment_status else 'pending' end
      where id=$1 and customer_id=$2 returning *
    `, [bookingId, customerId, paymentIntentId]);
    return mapBooking(result.rows[0]);
  }

  async updatePaymentStatus(paymentIntentId, paymentStatus) {
    const result = await this.pool.query(`
      update public.bookings set payment_status=$2
      where payment_intent_id=$1 and (payment_status <> 'succeeded' or $2 in ('succeeded','refunded'))
      returning *
    `, [paymentIntentId, paymentStatus]);
    return mapBooking(result.rows[0]);
  }
}

module.exports = {
  PostgresRepository, ActiveBookingExistsError, RatingExistsError, RATING_UNIQUE, ONE_ACTIVE_INDEX, ONE_JOB_PER_DRIVER_INDEX,
  mapProfile, mapDriverVehicle, mapVehicle, mapBooking, mapParticipantBooking, mapSupportReport, mapAdminSupportReport, mapJobMessage, ACTIVE_STATUSES, CONTACT_STATUSES,
};
