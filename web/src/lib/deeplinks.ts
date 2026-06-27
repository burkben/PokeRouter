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
