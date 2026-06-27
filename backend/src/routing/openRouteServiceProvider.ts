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
    private readonly profile: string = process.env.ORS_PROFILE ?? 'driving-car',
    private readonly baseUrl: string = process.env.ORS_BASE_URL ?? DEFAULT_BASE_URL,
  ) {
    if (!apiKey) throw new Error('OpenRouteServiceProvider requires an API key');
  }

  async route(waypoints: LngLat[]): Promise<RouteResult> {
    if (waypoints.length < 2) {
      throw new Error('route() requires at least 2 waypoints');
    }
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
      if (!res.ok) {
        const msg =
          typeof data.error === 'string' ? data.error : (data.error?.message ?? `HTTP ${res.status}`);
        throw new Error(`OpenRouteService error: ${msg}`);
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
    } finally {
      clearTimeout(timer);
    }
  }
}
