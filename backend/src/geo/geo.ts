/**
 * Geometry helpers operating on `[lng, lat]` tuples (GeoJSON axis order).
 *
 * Distances are in meters. For the short spans involved in "is this machine
 * near the route" checks we use a local equirectangular projection, which is
 * accurate to well under 1% at the few-kilometre scale of a detour corridor and
 * far cheaper than great-circle math per segment.
 */

/** `[lng, lat]`, GeoJSON axis order. */
export type LngLat = [number, number];

/** `[minLng, minLat, maxLng, maxLat]`. */
export type Bounds = [number, number, number, number];

const EARTH_RADIUS_M = 6_371_008.8;
const METERS_PER_DEG_LAT = 111_320;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance between two points, in meters. */
export function haversineMeters(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Project a point to local planar meters around a reference latitude. */
function project(p: LngLat, refLatDeg: number): [number, number] {
  const mPerDegLng = METERS_PER_DEG_LAT * Math.cos(toRad(refLatDeg));
  return [p[0] * mPerDegLng, p[1] * METERS_PER_DEG_LAT];
}

/** Shortest distance from point `p` to segment `a`–`b`, in meters. */
export function pointToSegmentMeters(p: LngLat, a: LngLat, b: LngLat): number {
  const ref = p[1];
  const [px, py] = project(p, ref);
  const [ax, ay] = project(a, ref);
  const [bx, by] = project(b, ref);

  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);

  let t = ((px - ax) * abx + (py - ay) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  return Math.hypot(px - cx, py - cy);
}

/** Shortest distance from point `p` to a polyline, in meters. */
export function pointToPolylineMeters(p: LngLat, line: readonly LngLat[]): number {
  if (line.length === 0) return Infinity;
  if (line.length === 1) return haversineMeters(p, line[0]);
  let min = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const d = pointToSegmentMeters(p, line[i], line[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

/** Total length of a polyline, in meters. */
export function polylineLengthMeters(line: readonly LngLat[]): number {
  let total = 0;
  for (let i = 0; i < line.length - 1; i++) total += haversineMeters(line[i], line[i + 1]);
  return total;
}

/** Axis-aligned bounding box of a polyline. */
export function boundsOf(line: readonly LngLat[]): Bounds {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of line) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLng, minLat, maxLng, maxLat];
}

/** Expand a bounds outward by `meters` on every side. */
export function expandBounds(b: Bounds, meters: number): Bounds {
  const dLat = meters / METERS_PER_DEG_LAT;
  const midLat = (b[1] + b[3]) / 2;
  const mPerDegLng = METERS_PER_DEG_LAT * Math.cos(toRad(midLat)) || METERS_PER_DEG_LAT;
  const dLng = meters / mPerDegLng;
  return [b[0] - dLng, b[1] - dLat, b[2] + dLng, b[3] + dLat];
}

/** Is point `p` inside bounds `b`? */
export function inBounds(p: LngLat, b: Bounds): boolean {
  return p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
}
