import type { LngLat } from '../geo/geo';
import type { RoutingProvider, RouteResult } from './types';

const DEFAULT_BASE_URL = 'https://api.openrouteservice.org';

interface OrsGeoJson {
  features?: Array<{
    geometry?: { coordinates?: LngLat[] };
    properties?: { summary?: { distance?: number; duration?: number } };
  }>;
  error?: { message?: string } | string;
}

/** Outcome of a startup key check. `auth` means the key was rejected. */
export type OrsValidation =
  | { ok: true }
  | { ok: false; kind: 'auth' | 'other'; message: string };

function orsErrorMessage(data: OrsGeoJson, status: number): string {
  if (typeof data.error === 'string') return data.error;
  if (data.error?.message) return data.error.message;
  return `HTTP ${status}`;
}

/**
 * OpenRouteService routing adapter (free hosted API). Requests GeoJSON so we get
 * `[lng, lat]` geometry plus a distance/duration summary with no polyline decode
 * step. Requires ORS_API_KEY.
 *
 * Docs: https://openrouteservice.org/dev/#/api-docs/v2/directions
 */
export class OpenRouteServiceProvider implements RoutingProvider {
  readonly name = 'openrouteservice';
  readonly isRoadRouting = true;

  constructor(
    private readonly apiKey: string,
    readonly profile: string = process.env.ORS_PROFILE ?? 'driving-car',
    private readonly baseUrl: string = process.env.ORS_BASE_URL ?? DEFAULT_BASE_URL,
  ) {
    if (!apiKey) throw new Error('OpenRouteServiceProvider requires an API key');
  }

  async route(waypoints: LngLat[]): Promise<RouteResult> {
    if (waypoints.length < 2) {
      throw new Error('route() requires at least 2 waypoints');
    }
    const { ok, status, data } = await this.fetchDirections(waypoints);
    if (!ok) {
      throw new Error(`OpenRouteService error: ${orsErrorMessage(data, status)}`);
    }
    const feature = data.features?.[0];
    const coordinates = feature?.geometry?.coordinates;
    const summary = feature?.properties?.summary;
    if (!coordinates || coordinates.length === 0 || !summary) {
      throw new Error('OpenRouteService returned no route geometry');
    }
    return {
      coordinates,
      distanceMeters: summary.distance ?? 0,
      durationSeconds: summary.duration ?? 0,
    };
  }

  /**
   * Cheaply check the API key at startup with a tiny routable request, so we can
   * report road-routing honestly and give the operator immediate feedback if the
   * key is wrong. Distinguishes a rejected key (`kind: 'auth'`) from a transient
   * error so callers can decide whether to disable road routing or keep trying.
   */
  async validate(): Promise<OrsValidation> {
    // Two points ~1.5 km apart in downtown Los Angeles — routable on the global graph.
    const probe: LngLat[] = [
      [-118.2437, 34.0522],
      [-118.2537, 34.0622],
    ];
    try {
      const { ok, status, data } = await this.fetchDirections(probe);
      if (ok) return { ok: true };
      const message = orsErrorMessage(data, status);
      if (status === 401 || status === 403) return { ok: false, kind: 'auth', message };
      return { ok: false, kind: 'other', message };
    } catch (err) {
      return { ok: false, kind: 'other', message: (err as Error).message };
    }
  }

  /** POST waypoints to the directions endpoint; returns the raw status + parsed body. */
  private async fetchDirections(
    waypoints: LngLat[],
  ): Promise<{ ok: boolean; status: number; data: OrsGeoJson }> {
    const url = `${this.baseUrl}/v2/directions/${this.profile}/geojson`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: this.apiKey,
          'content-type': 'application/json',
          accept: 'application/geo+json',
        },
        body: JSON.stringify({ coordinates: waypoints }),
        signal: controller.signal,
      });
      const data = (await res.json()) as OrsGeoJson;
      return { ok: res.ok, status: res.status, data };
    } finally {
      clearTimeout(timer);
    }
  }
}
