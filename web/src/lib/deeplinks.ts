import type { LatLng } from '../types';

const pt = (p: LatLng) => `${p.lat},${p.lng}`;

/**
 * Google Maps multi-stop directions deep link.
 * https://developers.google.com/maps/documentation/urls/get-started#directions-action
 */
export function googleMapsLink(origin: LatLng, stops: LatLng[], destination: LatLng): string {
  const params = new URLSearchParams({
    api: '1',
    origin: pt(origin),
    destination: pt(destination),
    travelmode: 'driving',
  });
  if (stops.length) params.set('waypoints', stops.map(pt).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Apple Maps multi-stop directions deep link (iOS 16+ supports intermediate
 * "to:" stops). saddr = origin, daddr = stop1 to:stop2 ... to:destination.
 */
export function appleMapsLink(origin: LatLng, stops: LatLng[], destination: LatLng): string {
  const daddr = [...stops, destination].map(pt).join('+to:');
  const params = new URLSearchParams({ saddr: pt(origin), dirflg: 'd' });
  // Build manually so the "+to:" separators survive encoding.
  return `https://maps.apple.com/?${params.toString()}&daddr=${encodeURIComponent(daddr)}`;
}

/**
 * Waze navigation link. Waze is single-destination only, so this routes to the
 * final destination; the multi-stop chain stays in Google/Apple Maps.
 */
export function wazeLink(destination: LatLng): string {
  return `https://waze.com/ul?ll=${pt(destination)}&navigate=yes`;
}

/** RFC 5870 geo: URI for the destination (Android intents / other map apps). */
export function geoUri(destination: LatLng): string {
  return `geo:${pt(destination)}`;
}

/**
 * Google/Apple Maps URLs only carry a limited number of intermediate stops
 * (Google documents 9). Beyond that, apps silently drop the extras — so we warn
 * and point users at the GPX export, which carries the full itinerary.
 */
export const MAX_MAP_WAYPOINTS = 9;

export function exceedsWaypointLimit(stopCount: number): boolean {
  return stopCount > MAX_MAP_WAYPOINTS;
}
