import type { FastifyInstance } from 'fastify';
import type { RoutingProvider } from '../routing/types';
import type { LngLat } from '../geo/geo';
import { buildGpx, type GpxPoint } from './gpx';
import { appleMapsLink, geoUri, googleMapsLink, wazeLink } from './links';

interface Deps {
  routing: RoutingProvider;
}

const namedPointSchema = {
  type: 'object',
  required: ['lat', 'lng'],
  properties: {
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lng: { type: 'number', minimum: -180, maximum: 180 },
    name: { type: 'string', maxLength: 200 },
  },
} as const;

const shareBodySchema = {
  type: 'object',
  required: ['origin', 'destination'],
  properties: {
    origin: namedPointSchema,
    destination: namedPointSchema,
    stops: { type: 'array', items: namedPointSchema, maxItems: 50 },
    name: { type: 'string', maxLength: 200 },
  },
} as const;

interface ShareBody {
  origin: GpxPoint;
  destination: GpxPoint;
  stops?: GpxPoint[];
  name?: string;
}

/**
 * "Universal delivery" endpoints: turn a planned itinerary into portable
 * artifacts (a downloadable GPX track, and canonical map deep links) that any
 * client — the web planner, a future iOS app, or the Tesla send-to-car flow —
 * can reuse without re-implementing the formats.
 */
export function registerShareRoutes(app: FastifyInstance, { routing }: Deps): void {
  app.post<{ Body: ShareBody }>(
    '/share/gpx',
    { schema: { body: shareBodySchema } },
    async (req, reply) => {
      const { origin, destination, name } = req.body;
      const stops = req.body.stops ?? [];
      const ordered = [origin, ...stops, destination];
      const waypoints: LngLat[] = ordered.map((p) => [p.lng, p.lat]);

      // Best-effort: enrich the GPX with the real road geometry. If routing
      // fails we still return a valid file with just the waypoints + route.
      let track: Array<[number, number]> | undefined;
      try {
        const result = await routing.route(waypoints);
        track = result.coordinates;
      } catch (err) {
        req.log.warn({ err }, 'share/gpx: routing failed, emitting waypoints only');
      }

      const gpx = buildGpx({ name: name ?? 'PokeRouter route', origin, destination, stops, track });
      reply
        .header('content-type', 'application/gpx+xml; charset=utf-8')
        .header('content-disposition', 'attachment; filename="pokerouter.gpx"');
      return gpx;
    },
  );

  app.post<{ Body: ShareBody }>(
    '/share/links',
    { schema: { body: shareBodySchema } },
    async (req) => {
      const { origin, destination } = req.body;
      const stops = req.body.stops ?? [];
      return {
        google: googleMapsLink(origin, stops, destination),
        apple: appleMapsLink(origin, stops, destination),
        waze: wazeLink(destination),
        geo: geoUri(destination),
      };
    },
  );
}
