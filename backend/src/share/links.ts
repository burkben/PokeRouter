/**
 * Universal map deep-link builders.
 *
 * These mirror the client-side builders in `web/src/lib/deeplinks.ts` so the
 * backend can hand the same URLs to other consumers — notably the Tesla
 * `navigation_request` "send to car" command, which forwards a Google Maps URL
 * to the vehicle's navigation. Keeping a server copy avoids a round-trip to the
 * browser when a non-web client (future iOS app, Tesla send) needs a link.
 */

export interface NamedPoint {
  lat: number;
  lng: number;
  name?: string;
}

const pt = (p: { lat: number; lng: number }): string => `${p.lat},${p.lng}`;

/**
 * Google Maps multi-stop directions deep link. Universal: opens the native app
 * on Android/iOS and the web map elsewhere.
 * https://developers.google.com/maps/documentation/urls/get-started#directions-action
 */
export function googleMapsLink(
  origin: { lat: number; lng: number },
  stops: Array<{ lat: number; lng: number }>,
  destination: { lat: number; lng: number },
): string {
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
 * Apple Maps multi-stop directions deep link (iOS 16+ honours intermediate
 * "to:" stops). saddr = origin, daddr = stop1 to:stop2 ... to:destination.
 */
export function appleMapsLink(
  origin: { lat: number; lng: number },
  stops: Array<{ lat: number; lng: number }>,
  destination: { lat: number; lng: number },
): string {
  const daddr = [...stops, destination].map(pt).join('+to:');
  const params = new URLSearchParams({ saddr: pt(origin), dirflg: 'd' });
  return `https://maps.apple.com/?${params.toString()}&daddr=${encodeURIComponent(daddr)}`;
}

/**
 * Waze navigation link. Waze is single-destination only, so this routes to the
 * final destination; the multi-stop chain stays in Google/Apple Maps.
 */
export function wazeLink(destination: { lat: number; lng: number }): string {
  return `https://waze.com/ul?ll=${pt(destination)}&navigate=yes`;
}

/** RFC 5870 geo: URI for the destination (handy for Android intents / other apps). */
export function geoUri(destination: { lat: number; lng: number }): string {
  return `geo:${pt(destination)}`;
}
