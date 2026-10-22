/**
 * Server-owned pricing. The price a customer sees is computed here and is the price charged.
 *
 * Rates (approved 2026-10-21) are set from US market rates:
 * - Towing: hook-up fee including the first 5 miles, then a per-mile rate
 *   (Texas market: $95–150 for the first 5–10 miles, then $4–7/mile).
 * - Everything else is a flat price per visit (see SERVICE_CATALOG in app.js).
 *
 * Distance is straight-line distance × 1.25 to approximate roads. Replace with real driving
 * distance from the maps provider when one is chosen (launch checklist G6).
 */

const TOWING = Object.freeze({ hookup: 95, includedMiles: 5, perMile: 4.5, maxMiles: 100 });
const ROAD_FACTOR = 1.25;
const EARTH_RADIUS_MILES = 3958.8;

class PricingError extends Error {}

const toRadians = (degrees) => (degrees * Math.PI) / 180;

function straightLineMiles(from, to) {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(a));
}

/** Estimated driving miles, rounded to 0.1 mi. */
function roadMiles(from, to) {
  return Math.round(straightLineMiles(from, to) * ROAD_FACTOR * 10) / 10;
}

const cents = (amount) => Math.round(amount * 100) / 100;

/** @returns {{ price: number, distanceMiles: number | null }} */
function quoteService(service, pickup, dropoff) {
  if (!service.requiresDropoff) return { price: service.basePrice, distanceMiles: null };
  if (!dropoff) throw new PricingError('A drop-off location is required for towing');
  const distanceMiles = roadMiles(pickup, dropoff);
  if (distanceMiles > TOWING.maxMiles) {
    throw new PricingError(`Tows longer than ${TOWING.maxMiles} miles aren't available in the app yet`);
  }
  const extraMiles = Math.max(0, distanceMiles - TOWING.includedMiles);
  return { price: cents(TOWING.hookup + extraMiles * TOWING.perMile), distanceMiles };
}

module.exports = { quoteService, roadMiles, PricingError, TOWING };
