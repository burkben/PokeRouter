import { haversineMeters, type LngLat } from '../geo/geo';
import type { RoutingProvider, RouteResult } from './types';

const DEFAULT_SPEED_KMH = 80;

/**
 * Offline routing stub: connects waypoints with straight great-circle segments
 * and estimates duration from a fixed average speed. It produces NO real road
 * geometry — it exists so the planner and API run end-to-end (and tests pass)
 * without an OpenRouteService key. Selected automatically when ORS_API_KEY is
 * unset.
 */
export class HaversineRoutingProvider implements RoutingProvider {
  readonly name = 'haversine-stub';
  readonly isRoadRouting = false;

  constructor(private readonly speedKmh: number = DEFAULT_SPEED_KMH) {}

  async route(waypoints: LngLat[]): Promise<RouteResult> {
    if (waypoints.length < 2) {
      throw new Error('route() requires at least 2 waypoints');
    }
    const coordinates = densify(waypoints);
    let distanceMeters = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      distanceMeters += haversineMeters(waypoints[i], waypoints[i + 1]);
    }
    const durationSeconds = (distanceMeters / 1000 / this.speedKmh) * 3600;
    return { coordinates, distanceMeters, durationSeconds };
  }
}

/** Insert intermediate points so straight legs still trace a usable polyline. */
function densify(waypoints: LngLat[], stepMeters = 5000): LngLat[] {
  const out: LngLat[] = [waypoints[0]];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const segLen = haversineMeters(a, b);
    const steps = Math.max(1, Math.floor(segLen / stepMeters));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
