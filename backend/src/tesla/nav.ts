import type { NamedPoint } from '../share/links';
import type { NavTarget } from './types';

/**
 * Tesla's Fleet API navigation is single-destination. When you hand it a shared
 * Google Maps *directions* link with intermediate `waypoints`, the car parses
 * out only the final destination and silently drops every stop — so a naive
 * "send the whole route" would drive the user straight home, skipping every
 * vending machine. (`navigation_waypoints_request` exists but only works over
 * the signed Vehicle Command Protocol / proxy and isn't broadly available.)
 *
 * So we model the itinerary as an ordered list of waypoints and send it one leg
 * at a time. `resolveTarget` picks the waypoint for this send; `navUrlFor`
 * renders it as a single-destination Google Maps *search* URL, which the car
 * parses reliably.
 */

/** The ordered waypoints the car should visit: every stop, then the destination. */
export function resolveWaypoints(target: NavTarget): NamedPoint[] {
  return [...(target.stops ?? []), target.destination];
}

export interface ResolvedLeg {
  point: NamedPoint;
  /** Clamped index into the waypoint list. */
  index: number;
  /** Total waypoint count (`stops.length + 1`). */
  count: number;
  /** Whether this leg is the final destination. */
  isFinal: boolean;
}

/**
 * Choose which waypoint to navigate to for this send. Defaults to the first
 * stop (`targetIndex` 0 — the next vending machine); an out-of-range index is
 * clamped into the itinerary.
 */
export function resolveTarget(target: NavTarget): ResolvedLeg {
  const waypoints = resolveWaypoints(target);
  const count = waypoints.length;
  const requested = target.targetIndex ?? 0;
  const index = Math.min(Math.max(Math.trunc(requested), 0), count - 1);
  return { point: waypoints[index], index, count, isFinal: index === count - 1 };
}

/** Single-destination Google Maps URL for the leg the car should navigate to. */
export function navUrlFor(target: NavTarget): string {
  return placeUrl(resolveTarget(target).point);
}

function placeUrl(p: NamedPoint): string {
  const params = new URLSearchParams({ api: '1', query: `${p.lat},${p.lng}` });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}
