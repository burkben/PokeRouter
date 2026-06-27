import type { LngLat } from '../geo/geo';

/** A computed route through a set of waypoints. */
export interface RouteResult {
  /** Polyline geometry as `[lng, lat]` tuples. */
  coordinates: LngLat[];
  distanceMeters: number;
  durationSeconds: number;
}

/**
 * Pluggable routing backend. Implementations turn an ordered list of waypoints
 * into a drivable route. Swap OpenRouteService for self-hosted Valhalla/OSRM
 * later without touching the planner.
 */
export interface RoutingProvider {
  readonly name: string;
  /** Whether this provider produces real road geometry (vs. a straight-line dev stub). */
  readonly isRoadRouting: boolean;
  route(waypoints: LngLat[]): Promise<RouteResult>;
}
