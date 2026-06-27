import { googleMapsLink, type NamedPoint } from '../share/links';
import type { NavTarget } from './types';

/**
 * Turn a planned itinerary into a single URL the Tesla can open. Tesla's
 * `navigation_request` (type `share_ext_content_raw`) parses a shared Google
 * Maps link, so we reuse the same builder the web/share layer uses.
 *
 * With an origin we send full multi-stop directions; without one we fall back to
 * a destination "search" URL (the car still routes there from its location).
 */
export function navUrlFor(target: NavTarget): string {
  const { origin, destination } = target;
  const stops = target.stops ?? [];
  if (origin) return googleMapsLink(origin, stops, destination);
  return placeUrl(destination);
}

function placeUrl(p: NamedPoint): string {
  const params = new URLSearchParams({ api: '1', query: `${p.lat},${p.lng}` });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}
