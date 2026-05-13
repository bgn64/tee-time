/**
 * Geographic helpers. All math is pure, no external dependencies. Used
 * client-side only; coordinates never leave the device.
 */

const EARTH_RADIUS_MI = 3958.7613;
const YARDS_PER_MILE = 1760;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export type LatLon = { latitude: number; longitude: number };

/**
 * Great-circle distance in miles between two points. Haversine formula.
 * Returns 0 for identical inputs. Caller handles missing coords.
 */
export function distanceMiles(a: LatLon, b: LatLon): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Great-circle distance in yards between two points. Uses the same
 * haversine source as distanceMiles so short golf-range measurements and
 * course-search distances stay consistent.
 */
export function distanceYards(a: LatLon, b: LatLon): number {
  return distanceMiles(a, b) * YARDS_PER_MILE;
}

/**
 * Format a mileage as a short label suitable for badge UI:
 *   "0.4 mi" / "8 mi" / "120 mi".
 * Sub-mile values keep one decimal so 0.4 mi doesn't render as "0 mi".
 */
export function formatMiles(miles: number): string {
  if (!Number.isFinite(miles) || miles < 0) return '';
  if (miles < 1) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

/**
 * Format yards as a whole-yard golf distance label.
 */
export function formatYards(yards: number): string {
  if (!Number.isFinite(yards) || yards < 0) return '';
  return `${Math.round(yards)} yd`;
}
