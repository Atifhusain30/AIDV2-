// In-memory repository for the C2/C3 payment tests. Mirrors the SQL contract of PostgresRepository
// (same method names, arguments and return shapes; same guards: compare-and-set statuses, monotonic
// payment states, refund/fee caps, event dedupe) so app.js is exercised exactly as in production.
const { randomUUID } = require('node:crypto');

const ACTIVE = ['pending', 'searching', 'accepted', 'en_route', 'arrived', 'in_progress'];
const OPEN = ['awaiting_authorization', 'authorized', 'failed'];
const dollars = (cents) => cents / 100;

function createPaymentsRepository({ users, clock = () => Date.now(), requestExpiryMinutes = 15, staleJobMinutes = 60 }) {
  const bookings = new Map();
  const payments = new Map(); // bookingId → payment row (cents)
  const customers = new Map();
  const stripeEvents = new Set();
  const refunds = new Map();
  const events = [];

  const byIntent = (intentId) => [...payments.values()].find((row) => row.intentId === intentId) || null;
  const summary = (bookingId, booking) => {
    const row = payments.get(bookingId);
    if (row) {
      return {
        status: row.status, amountAuthorized: dollars(row.amountAuthorizedCents), amountCaptured: dollars(row.amountCapturedCents),
        cancellationFee: dollars(row.cancellationFeeCents), refunded: dollars(row.refundedCents),
        ...(row.lastError && ['failed', 'awaiting_authorization'].includes(row.status) ? { error: row.lastError } : {}),
      };
    }
    return booking.paymentStatus === 'not_required' ? { status: 'not_required', amountAuthorized: 0, amountCaptured: 0, cancellationFee: 0, refunded: 0 } : undefined;
  };
  const view = (booking, role = 'customer') => {
    if (!booking) return null;
    const { paymentStatus: _paymentStatus, lastDriverActivityAt: _activity, ...rest } = booking;
    const out = { ...rest, payment: summary(booking.id, booking) };
    if (role === 'driver') delete out.payment;
    return out;
  };
  const cancelledBy = (bookingId) => {
    const event = [...events].reverse().find((e) => e.bookingId === bookingId && e.type === 'status_changed' && e.to === 'cancelled');
    if (!event) return null;
    const booking = bookings.get(bookingId);
    if (event.actorId === null) return 'system';
    return event.actorId === booking.customerId ? 'customer' : event.actorId === booking.driverId ? 'driver' : 'support';
  };
  const paymentView = (row) => row && ({
    ...row, bookingStatus: bookings.get(row.bookingId).status, customerId: bookings.get(row.bookingId).customerId,
    finalCents: null, cancelledBy: cancelledBy(row.bookingId),
  });
  const paymentEvent = (bookingId, metadata, actorId = null) => {
    const status = bookings.get(bookingId).status;
    events.push({ bookingId, actorId, type: 'payment', from: status, to: status, metadata });
  };

  const repository = {
    bookings, payments, customers, stripeEvents, refunds, events,
    requestExpiryMinutes,
    async getProfile(userId) { return Object.values(users).find((user) => user.id === userId) || null; },
    async getVehicle() { return null; },
    async getBlockBetween() { return { byMe: false, byThem: false }; },
    async getChatSummary() { return { unread: 0, block: { byMe: false, byThem: false } }; },
    async getDriverPosition() { return { lat: 32.7767, lng: -96.797, at: new Date(clock()) }; },
    async updateDriverPosition() {},
    async createBooking(input) {
      if ([...bookings.values()].some((b) => b.customerId === input.customerId && ACTIVE.includes(b.status))) {
        throw Object.assign(new Error('duplicate'), { code: 'active_request_exists' });
      }
      const booking = {
        id: randomUUID(), customerId: input.customerId, service: input.service, location: input.location, dropoffLocation: input.dropoffLocation || undefined,
        estimatedPrice: input.estimatedPrice, notes: input.notes || undefined, status: input.status === 'pending' ? 'pending' : 'searching',
        paymentStatus: input.paymentStatus === 'not_required' ? 'not_required' : 'pending', createdAt: new Date(clock()),
      };
      bookings.set(booking.id, booking);
      return view(booking);
    },
    async getBooking(bookingId, userId, role) {
      const booking = bookings.get(bookingId);
      if (!booking) return null;
      if (role === 'customer' && booking.customerId !== userId) return null;
      if (role === 'driver' && booking.driverId !== userId) return null;
      return view(booking, role);
    },
    async getActiveBooking(userId, role) {
      const key = role === 'driver' ? 'driverId' : 'customerId';
      return view([...bookings.values()].find((b) => b[key] === userId && ACTIVE.includes(b.status)) || null, role);
    },
    async listBookings(userId, role) {
      const key = role === 'driver' ? 'driverId' : 'customerId';
      return [...bookings.values()].filter((b) => b[key] === userId).map((b) => view(b, role));
    },
    async getBookingStatus(bookingId) { return bookings.get(bookingId)?.status || null; },
    async getRealtimeTargets(ids) {
      return ids.map((id) => bookings.get(id)).filter(Boolean).map((b) => ({
        id: b.id, customerId: b.customerId, driverId: b.driverId || null, serviceType: b.service.id, vehicleIsElectric: false, pickup: { lat: b.location.lat, lng: b.location.lng },
      }));
    },
    async listAvailableBookings(capability) {
      return [...bookings.values()].filter((b) => b.status === 'searching' && !b.driverId && capability.serviceTypes.includes(b.service.id))
        .map((b) => ({ ...view(b, 'driver'), pickup: { lat: b.location.lat, lng: b.location.lng } }));
    },
    async getAvailableBooking(bookingId) {
      const b = bookings.get(bookingId);
      if (!b || b.status !== 'searching' || b.driverId) return null;
      return { id: b.id, customerId: b.customerId, serviceType: b.service.id, vehicleIsElectric: false, pickup: { lat: b.location.lat, lng: b.location.lng } };
    },
    async acceptBooking(bookingId, driverId) {
      const b = bookings.get(bookingId);
      if (!b || b.status !== 'searching' || b.driverId) return null;
      Object.assign(b, { status: 'accepted', driverId, lastDriverActivityAt: new Date(clock()) });
      events.push({ bookingId, actorId: driverId, type: 'status_changed', from: 'searching', to: 'accepted' });
      return view(b, 'driver');
    },
    async updateBookingStatus(bookingId, actorId, role, nextStatus, allowed, { reason = null, cancellationFeeCents = 0 } = {}) {
      const b = bookings.get(bookingId);
      const owner = role === 'customer' ? b?.customerId : b?.driverId;
      if (!b || owner !== actorId || !allowed.includes(b.status)) return null;
      events.push({ bookingId, actorId, type: 'status_changed', from: b.status, to: nextStatus, metadata: { role, ...(reason ? { reason } : {}), ...(cancellationFeeCents ? { cancellationFeeCents } : {}) } });
      b.status = nextStatus;
      b.lastDriverActivityAt = new Date(clock());
      const pay = payments.get(bookingId);
      if (nextStatus === 'cancelled' && cancellationFeeCents > 0 && pay && pay.status === 'authorized') {
        pay.cancellationFeeCents = Math.min(cancellationFeeCents, pay.amountAuthorizedCents);
      }
      return view(b, role);
    },
    async expireStaleBookings(scope = {}) {
      const result = { expired: [], released: [] };
      for (const b of bookings.values()) {
        if ((scope.customerId && b.customerId !== scope.customerId) || (scope.driverId && b.driverId !== scope.driverId) || (scope.bookingId && b.id !== scope.bookingId)) continue;
        if (['pending', 'searching'].includes(b.status) && clock() - b.createdAt.getTime() >= requestExpiryMinutes * 60000) {
          events.push({ bookingId: b.id, actorId: null, type: 'status_changed', from: b.status, to: 'expired', metadata: { role: 'system', reason: 'no_driver_found' } });
          b.status = 'expired';
          result.expired.push(b.id);
        } else if (['accepted', 'en_route'].includes(b.status) && b.lastDriverActivityAt && clock() - b.lastDriverActivityAt.getTime() >= staleJobMinutes * 60000) {
          events.push({ bookingId: b.id, actorId: null, type: 'status_changed', from: b.status, to: 'cancelled', metadata: { role: 'system', reason: 'driver_unresponsive' } });
          b.status = 'cancelled';
          result.released.push(b.id);
        }
      }
      return result;
    },

    // ---- payments ----
    async getStripeCustomerId(profileId) { return customers.get(profileId) || null; },
    async saveStripeCustomer(profileId, id) { if (!customers.has(profileId)) customers.set(profileId, id); return customers.get(profileId); },
    async createBookingPayment({ bookingId, intentId, stripeCustomerId, quotedCents, currency = 'usd' }) {
      if (payments.has(bookingId)) return;
      payments.set(bookingId, {
        bookingId, intentId, stripeCustomerId, status: 'awaiting_authorization', currency, quotedCents,
        amountAuthorizedCents: 0, amountCapturedCents: 0, cancellationFeeCents: 0, refundedCents: 0,
        lastError: null, needsAttention: null, settlementAttempts: 0, dispute: null, authorizedAt: null, settledAt: null,
      });
      paymentEvent(bookingId, { role: 'system', action: 'hold_requested', amountCents: quotedCents });
    },
    async getBookingPayment(bookingId) { return paymentView(payments.get(bookingId)) || null; },
    async getPaymentByIntent(intentId) { return paymentView(byIntent(intentId)); },
    async markPaymentAuthorized(intentId, capturable, { source = 'sync' } = {}) {
      const row = byIntent(intentId);
      if (!row) return null;
      let changed = false;
      let promoted = false;
      if (['awaiting_authorization', 'failed'].includes(row.status)) {
        Object.assign(row, { status: 'authorized', amountAuthorizedCents: capturable, authorizedAt: new Date(clock()).toISOString(), lastError: null });
        changed = true;
        paymentEvent(row.bookingId, { role: 'system', action: 'authorized', amountCents: capturable, source });
        const b = bookings.get(row.bookingId);
        if (b.status === 'pending') {
          b.status = 'searching';
          promoted = true;
          events.push({ bookingId: b.id, actorId: null, type: 'status_changed', from: 'pending', to: 'searching', metadata: { role: 'system', reason: 'payment_authorized' } });
        }
      }
      return { bookingId: row.bookingId, changed, promoted };
    },
    async markPaymentFailed(intentId, message) {
      const row = byIntent(intentId);
      if (!row) return null;
      const changed = ['awaiting_authorization', 'failed'].includes(row.status);
      if (changed) { Object.assign(row, { status: 'failed', lastError: message }); paymentEvent(row.bookingId, { role: 'system', action: 'failed' }); }
      return { bookingId: row.bookingId, changed };
    },
    async markPaymentCaptured(intentId, amountReceived) {
      const row = byIntent(intentId);
      if (!row) return null;
      const changed = OPEN.includes(row.status);
      if (changed) {
        if (amountReceived > Math.max(row.amountAuthorizedCents, row.quotedCents)) throw new Error('check constraint booking_payments_capture_not_above_hold');
        const status = bookings.get(row.bookingId).status === 'cancelled' ? 'fee_captured' : 'captured';
        Object.assign(row, { status, amountCapturedCents: amountReceived, settledAt: row.settledAt || new Date(clock()).toISOString(), lastError: null,
          needsAttention: row.needsAttention === 'settlement_failed' ? null : row.needsAttention });
        paymentEvent(row.bookingId, { role: 'system', action: status, amountCents: amountReceived });
      }
      return { bookingId: row.bookingId, changed };
    },
    async markPaymentReleased(intentId) {
      const row = byIntent(intentId);
      if (!row) return null;
      const changed = OPEN.includes(row.status);
      if (changed) {
        Object.assign(row, { status: 'released', settledAt: row.settledAt || new Date(clock()).toISOString(), lastError: null,
          needsAttention: row.needsAttention === 'settlement_failed' ? null : row.needsAttention });
        paymentEvent(row.bookingId, { role: 'system', action: 'released', amountCents: 0 });
      }
      return { bookingId: row.bookingId, changed };
    },
    async recordSettlementError(bookingId, message, attentionAfter = 3) {
      const row = payments.get(bookingId);
      if (!row) return;
      row.settlementAttempts += 1;
      row.lastError = message;
      if (!row.needsAttention && row.settlementAttempts >= attentionAfter) row.needsAttention = 'settlement_failed';
    },
    async listUnsettledPayments(limit = 50) {
      return [...payments.values()].filter((row) => OPEN.includes(row.status) && ['completed', 'cancelled', 'expired'].includes(bookings.get(row.bookingId).status))
        .slice(0, limit).map((row) => row.bookingId);
    },
    async cancelUnpaidPending({ customerId = null, bookingId = null, olderThanMinutes = null }) {
      const ended = [];
      for (const b of bookings.values()) {
        const pay = payments.get(b.id);
        if (b.status !== 'pending' || (pay && !['awaiting_authorization', 'failed'].includes(pay.status))) continue;
        if ((customerId && b.customerId !== customerId) || (bookingId && b.id !== bookingId)) continue;
        if (olderThanMinutes != null && clock() - b.createdAt.getTime() < olderThanMinutes * 60000) continue;
        b.status = 'cancelled';
        events.push({ bookingId: b.id, actorId: null, type: 'status_changed', from: 'pending', to: 'cancelled', metadata: { role: 'system', reason: 'payment_not_completed' } });
        ended.push(b.id);
      }
      return ended;
    },
    async recordRefund(bookingId, { refundId, amountCents, status, reason, stripeReason, adminId }) {
      if (!refunds.has(refundId)) {
        refunds.set(refundId, { id: refundId, bookingId, amountCents, status, reason, stripeReason, adminId });
        const row = payments.get(bookingId);
        row.refundedCents = Math.min(row.amountCapturedCents, row.refundedCents + amountCents);
        row.status = row.refundedCents >= row.amountCapturedCents ? 'refunded' : 'partially_refunded';
        paymentEvent(bookingId, { role: 'admin', action: 'refunded', amountCents, refundId, reason, stripeReason }, adminId);
      }
      return paymentView(payments.get(bookingId));
    },
    async applyChargeRefunded(intentId, amountRefunded, list = []) {
      const row = byIntent(intentId);
      if (!row) return null;
      for (const refund of list) if (refund.id && !refunds.has(refund.id)) refunds.set(refund.id, { ...refund, bookingId: row.bookingId });
      const changed = row.amountCapturedCents > 0 && amountRefunded > row.refundedCents && ['captured', 'fee_captured', 'partially_refunded', 'refunded'].includes(row.status);
      if (changed) {
        row.refundedCents = Math.min(row.amountCapturedCents, amountRefunded);
        row.status = row.refundedCents >= row.amountCapturedCents ? 'refunded' : 'partially_refunded';
        paymentEvent(row.bookingId, { role: 'system', action: 'refund_recorded', amountCents: row.refundedCents });
      }
      return { bookingId: row.bookingId, changed };
    },
    async applyDispute(intentId, { disputeId, status, amountCents, reason, open }) {
      const row = byIntent(intentId);
      if (!row) return null;
      row.dispute = { id: disputeId, status, amountCents, reason };
      row.needsAttention = open ? 'dispute' : row.needsAttention === 'dispute' ? null : row.needsAttention;
      paymentEvent(row.bookingId, { role: 'system', action: open ? `dispute_${status}` : `dispute_closed_${status}`, amountCents });
      return { bookingId: row.bookingId, changed: true };
    },
    async recordStripeEvent(id) { if (stripeEvents.has(id)) return false; stripeEvents.add(id); return true; },
    async forgetStripeEvent(id) { stripeEvents.delete(id); },
    async listPaymentsForAdmin(filter = 'attention') {
      const all = [...payments.values()].map(paymentView);
      const pick = { attention: (p) => p.needsAttention, disputes: (p) => p.dispute, refunds: (p) => p.refundedCents > 0, all: () => true }[filter];
      return { payments: all.filter(pick), counts: { attention: all.filter((p) => p.needsAttention).length, disputes: all.filter((p) => p.needsAttention === 'dispute').length } };
    },
    async getPaymentForAdmin(bookingId) {
      const row = payments.get(bookingId);
      if (!row) return null;
      return { ...paymentView(row), refunds: [...refunds.values()].filter((r) => r.bookingId === bookingId), events: events.filter((e) => e.bookingId === bookingId) };
    },
  };
  return repository;
}

module.exports = { createPaymentsRepository };
