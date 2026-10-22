/**
 * E4 background sweep: every `intervalMs`, end stale work everywhere (repository.expireStaleBookings
 * with no scope). The same check also runs lazily on reads and creates, so the sweep only keeps the
 * database tidy between requests; an overdue request is never listed or accepted even before it runs.
 * Never overlaps itself; errors are logged and the next tick tries again. Returns stop().
 */
function startExpirySweep({ repository, intervalMs, logger = console, onExpired = null, onTick = null }) {
  let running = false;
  async function tick() {
    if (running) return null;
    running = true;
    try {
      const result = await repository.expireStaleBookings();
      // C2: payments housekeeping on the same cadence (settle released/expired holds, end unpaid requests).
      if (onTick) {
        try { await onTick(result); } catch (error) { logger.error('[AID expiry] payments tick failed:', error.message || error); }
      }
      if (result.expired.length || result.released.length) {
        logger.log(`[AID expiry] expired ${result.expired.length} unaccepted request(s), released ${result.released.length} silent job(s)`);
        // B11: tell the affected customers/drivers (and nearby drivers) right away.
        if (onExpired) {
          try { await onExpired(result); } catch (error) { logger.error('[AID expiry] realtime notify failed:', error.message || error); }
        }
      }
      return result;
    } catch (error) {
      logger.error('[AID expiry] sweep failed:', error.message || error);
      return null;
    } finally {
      running = false;
    }
  }
  const timer = setInterval(() => void tick(), intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return { stop: () => clearInterval(timer), tick };
}

module.exports = { startExpirySweep };
