const { types } = require('pg');
const { estimateArrival } = require('./pricing');
const {
  ACTIVE_STATUSES: ACTIVE, EXPIRABLE, STALE_RELEASABLE, DEFAULT_REQUEST_EXPIRY_MINUTES, DEFAULT_STALE_JOB_MINUTES,
} = require('./lifecycle');

// Keep SQL `date` values as YYYY-MM-DD strings; JS Date conversion shifts them by timezone.
types.setTypeParser(1082, (value) => value);

const ACTIVE_STATUSES = [...ACTIVE];
// The partial unique index that allows one active booking per customer (migration 20261022200000).
const ONE_ACTIVE_INDEX = 'bookings_one_active_per_customer';
// ...and one unfinished job per driver.
const ONE_JOB_PER_DRIVER_INDEX = 'bookings_one_active_job_per_driver';

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
    ...(row.role === 'driver' ? {
      verificationStatus: row.verification_status,
      isVerified: row.verification_status === 'verified',
      credentialsValidUntil: row.credentials_valid_until || null,
      isOnline: row.is_online,
      rating: Number(row.rating || 0),
      totalJobs: row.total_jobs || 0,
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

// Contact details and live location are shared only while a job is in progress.
const CONTACT_STATUSES = new Set(['accepted', 'en_route', 'arrived', 'in_progress']);
// The driver is still heading to the pickup in these statuses, so an arrival estimate makes sense.
const ETA_STATUSES = new Set(['accepted', 'en_route']);
const PARTY_SELECT = `
  select b.*, concat_ws(' ', v.year, v.make, v.model) as vehicle_label, v.license_plate as vehicle_plate, v.color as vehicle_color,
    c.first_name as party_customer_first_name, c.last_name as party_customer_last_name, c.phone as party_customer_phone,
    d.first_name as party_driver_first_name, d.last_name as party_driver_last_name, d.phone as party_driver_phone,
    dp.rating as party_driver_rating, dp.total_jobs as party_driver_total_jobs,
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
  left join public.driver_profiles dp on dp.profile_id = b.driver_id`;

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
      rating: Number(row.party_driver_rating || 0),
      totalJobs: row.party_driver_total_jobs || 0,
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
      select p.*, dp.verification_status, dp.credentials_valid_until, dp.is_online, dp.rating, dp.total_jobs, dp.specializations,
        dp.vehicle_make, dp.vehicle_model, dp.vehicle_year, dp.vehicle_color, dp.vehicle_plate, dp.vehicle_plate_state, dp.vehicle_equipment_type
      from public.profiles p left join public.driver_profiles dp on dp.profile_id = p.id
      where p.id = $1
    `, [userId]);
    return mapProfile(result.rows[0]);
  }

  async updateProfile(userId, patch) {
    const result = await this.pool.query(`
      update public.profiles set first_name = $2, last_name = $3, phone = $4
      where id = $1 returning *
    `, [userId, patch.firstName, patch.lastName, patch.phone]);
    return mapProfile(result.rows[0]);
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
             dp.credentials_valid_until, dp.is_online, dp.rating, dp.total_jobs
      from public.profiles p
      join public.driver_profiles dp on dp.profile_id = p.id
      left join auth.users u on u.id = p.id
      where p.id = $1 and p.role = 'driver'
    `, [driverId]);
    const row = driver.rows[0];
    if (!row) return null;
    const [documents, events] = await Promise.all([
      this.listDriverDocuments(driverId),
      this.pool.query(`
        select e.*, a.first_name as actor_first_name, a.last_name as actor_last_name, a.role as actor_role
        from public.driver_verification_events e left join public.profiles a on a.id = e.actor_id
        where e.driver_id = $1 order by e.created_at desc limit 100
      `, [driverId]),
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
        rating: Number(row.rating || 0),
        totalJobs: row.total_jobs || 0,
        ...mapVerification(row),
        verificationStatus: row.verification_status,
      },
      documents,
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
  async listAvailableBookings({ serviceTypes = [], electricTowing = false } = {}, area = null) {
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
      order by power(b.location_lat - $7, 2) + power((b.location_lng - $8) * cos(radians($7)), 2), b.created_at asc
      limit 500
    `, [serviceTypes, electricTowing, area.minLat, area.maxLat, area.minLng, area.maxLng, center.lat, center.lng, this.requestExpiryMinutes]);
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
      select b.id, b.service_type, b.location_lat, b.location_lng, coalesce(v.is_electric, false) as vehicle_is_electric
      from public.bookings b left join public.vehicles v on v.id=b.vehicle_id
      where b.id=$1 and b.status='searching' and b.driver_id is null
        and b.created_at > now() - make_interval(mins => $2::int)
    `, [bookingId, this.requestExpiryMinutes]);
    const row = result.rows[0];
    return row ? {
      id: row.id, serviceType: row.service_type, vehicleIsElectric: Boolean(row.vehicle_is_electric),
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

  async reportBookingIssue(bookingId, actorId, { role, category, details, status }) {
    const result = await this.pool.query(`
      insert into public.booking_events (booking_id, actor_id, event_type, from_status, to_status, metadata)
      values ($1, $2, 'issue_reported', $3, $3, $4::jsonb)
      returning id, created_at
    `, [bookingId, actorId, status, JSON.stringify({ role, category, details: details || null })]);
    const row = result.rows[0];
    return { id: String(row.id), bookingId, category, status, createdAt: new Date(row.created_at).toISOString() };
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
  PostgresRepository, ActiveBookingExistsError, ONE_ACTIVE_INDEX, ONE_JOB_PER_DRIVER_INDEX,
  mapProfile, mapDriverVehicle, mapVehicle, mapBooking, mapParticipantBooking, ACTIVE_STATUSES, CONTACT_STATUSES,
};
