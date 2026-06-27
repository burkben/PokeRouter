import type { Bbox } from '../types';

/**
 * The vending API returns at most this many machines per request, sorted by
 * distance from the bounding-box center. A response at the cap means the box is
 * "saturated" (it likely contains more machines than were returned) and should
 * be subdivided.
 */
export const PAGE_CAP = 20;

/** Split a bounding box into its four equal quadrants (SW, SE, NW, NE). */
export function splitBbox(b: Bbox): Bbox[] {
  const midLat = (b.swLat + b.neLat) / 2;
  const midLng = (b.swLng + b.neLng) / 2;
  return [
    { swLat: b.swLat, swLng: b.swLng, neLat: midLat, neLng: midLng },
    { swLat: b.swLat, swLng: midLng, neLat: midLat, neLng: b.neLng },
    { swLat: midLat, swLng: b.swLng, neLat: b.neLat, neLng: midLng },
    { swLat: midLat, swLng: midLng, neLat: b.neLat, neLng: b.neLng },
  ];
}

/** The larger of a box's latitude/longitude spans, in degrees. */
export function bboxSpanDeg(b: Bbox): number {
  return Math.max(b.neLat - b.swLat, b.neLng - b.swLng);
}

/**
 * Coarse seed regions fed into the adaptive sweep. Empty areas resolve in a
 * single request, so over-covering is cheap.
 */
export const SEED_REGIONS: { name: string; bbox: Bbox }[] = [
  { name: 'Continental US', bbox: { swLat: 24.0, swLng: -125.0, neLat: 49.5, neLng: -66.5 } },
  { name: 'Hawaii', bbox: { swLat: 18.8, swLng: -160.5, neLat: 22.5, neLng: -154.7 } },
  { name: 'Alaska', bbox: { swLat: 51.0, swLng: -170.0, neLat: 71.5, neLng: -129.0 } },
];
