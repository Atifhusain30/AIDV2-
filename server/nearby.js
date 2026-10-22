/**
 * "Nearby" dispatch (B8): an online driver is offered only open requests within a service radius
 * of where they are now, nearest first, each with its estimated road distance.
 *
 * - Radius: DRIVER_REQUEST_RADIUS_MILES (estimated road miles, same estimate as pricing/ETA),
 *   default 25, clamped to 1–100 so a typo can't open or close the whole map.
 * - Driver position: the last position the driver app sent (with the request list, or while sharing
 *   GPS on a job), stored on driver_profiles with a timestamp. Older than LOCATION_MAX_AGE_MINUTES
 *   counts as unknown, so a stale position never decides what a driver is offered.
 */

const { roadMiles } = require('./pricing');

const DEFAULT_RADIUS_MILES = 25;
const MAX_RADIUS_MILES = 100;
const MIN_RADIUS_MILES = 1;
const LOCATION_MAX_AGE_MINUTES = 10;
const MAX_REQUESTS = 50;
const LOCATION_REQUIRED_CODE = 'location_required';
const OUT_OF_RANGE_CODE = 'out_of_range';

function radiusFromEnv(env = process.env) {
  const value = Number(env.DRIVER_REQUEST_RADIUS_MILES);
  if (!env.DRIVER_REQUEST_RADIUS_MILES || !Number.isFinite(value)) return DEFAULT_RADIUS_MILES;
  return Math.min(MAX_RADIUS_MILES, Math.max(MIN_RADIUS_MILES, value));
}

/**
 * Validate a driver-reported position. Accepts numbers or numeric strings (query params).
 * Rejects out-of-range values and 0,0 ("null island" — what broken GPS reports).
 * @returns {{ lat: number, lng: number } | null}
 */
function parsePosition(lat, lng) {
  if (lat === undefined || lat === null || lat === '' || lng === undefined || lng === null || lng === '') return null;
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;
  if (Math.abs(la) < 1e-6 && Math.abs(ln) < 1e-6) return null;
  return { lat: la, lng: ln };
}

/** Bounding box (straight-line) that contains every point within `radiusMiles` road miles. */
function boundingBox({ lat, lng }, radiusMiles) {
  const dLat = radiusMiles / 69;
  const cos = Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  const dLng = Math.min(180, radiusMiles / (69 * cos));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

const distanceTo = (from, pickup) => roadMiles(from, pickup);

/**
 * Keep candidates within the radius, nearest first (oldest first on ties), capped at MAX_REQUESTS.
 * Each candidate carries its exact `pickup` {lat,lng}; it is removed from the result (the list only
 * shows an approximate area) and replaced by `distanceMiles`.
 */
function nearestWithin(candidates, from, radiusMiles, limit = MAX_REQUESTS) {
  return candidates
    .map(({ pickup, ...request }) => ({ request, distanceMiles: distanceTo(from, pickup) }))
    .filter(({ distanceMiles }) => distanceMiles <= radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles || new Date(a.request.createdAt || 0) - new Date(b.request.createdAt || 0))
    .slice(0, limit)
    .map(({ request, distanceMiles }) => ({ ...request, distanceMiles }));
}

module.exports = {
  DEFAULT_RADIUS_MILES, LOCATION_MAX_AGE_MINUTES, MAX_REQUESTS, LOCATION_REQUIRED_CODE, OUT_OF_RANGE_CODE,
  radiusFromEnv, parsePosition, boundingBox, distanceTo, nearestWithin,
};
