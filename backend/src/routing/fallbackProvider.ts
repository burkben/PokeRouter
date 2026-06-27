import type { LngLat } from '../geo/geo';
import type { RoutingProvider, RouteResult } from './types';

/**
 * Wraps a primary routing provider and degrades to a fallback when the primary
 * throws (e.g. OpenRouteService rate-limit, quota exhaustion, or a transient
 * network error). This keeps the planner responsive instead of returning a 500
 * and breaking the whole app on a single failed upstream request.
 *
 * It advertises the primary provider's `name`/`isRoadRouting` so a healthy key
 * reports road routing; individual failures fall back silently (with a warning)
 * for that one request.
 */
export class FallbackRoutingProvider implements RoutingProvider {
  readonly name: string;
  readonly isRoadRouting: boolean;

  constructor(
    private readonly primary: RoutingProvider,
    private readonly fallback: RoutingProvider,
  ) {
    this.name = primary.name;
    this.isRoadRouting = primary.isRoadRouting;
  }

  async route(waypoints: LngLat[]): Promise<RouteResult> {
    try {
      return await this.primary.route(waypoints);
    } catch (err) {
      console.warn(
        `[routing] ${this.primary.name} request failed (${(err as Error).message}); ` +
          `falling back to ${this.fallback.name} for this request.`,
      );
      return this.fallback.route(waypoints);
    }
  }
}
