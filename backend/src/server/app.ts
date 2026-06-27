import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { MachineStore } from '../catalog/machineStore';
import type { RoutingProvider } from '../routing/types';
import { planCorridorRoute } from '../planner/corridor';
import type { PlanRequest } from '../planner/types';
import type { LngLat } from '../geo/geo';
import { registerShareRoutes } from '../share/routes';

interface Deps {
  store: MachineStore;
  routing: RoutingProvider;
}

const latLngSchema = {
  type: 'object',
  required: ['lat', 'lng'],
  properties: {
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lng: { type: 'number', minimum: -180, maximum: 180 },
  },
} as const;

const planBodySchema = {
  type: 'object',
  required: ['origin', 'destination'],
  properties: {
    origin: latLngSchema,
    destination: latLngSchema,
    maxStops: { type: 'integer', minimum: 0, maximum: 25 },
    corridorMeters: { type: 'number', minimum: 0, maximum: 50_000 },
    maxAddedMetersPerStop: { type: 'number', minimum: 0, maximum: 200_000 },
    retailers: { type: 'array', items: { type: 'string' }, maxItems: 100 },
  },
} as const;

const routeBodySchema = {
  type: 'object',
  required: ['points'],
  properties: {
    points: {
      type: 'array',
      minItems: 2,
      maxItems: 50,
      items: latLngSchema,
    },
  },
} as const;

const nearQuerySchema = {
  type: 'object',
  required: ['lat', 'lng'],
  properties: {
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lng: { type: 'number', minimum: -180, maximum: 180 },
    radiusMeters: { type: 'number', minimum: 0, maximum: 100_000, default: 8000 },
    limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
  },
} as const;

/** Build the Fastify app with routes wired to the given store and router. */
export function buildApp({ store, routing }: Deps): FastifyInstance {
  const app = Fastify({ logger: true });

  // Permissive CORS for the web planner. Override the allowed origin in
  // production via CORS_ORIGIN (comma-separated); defaults to reflecting any
  // origin, which is fine for local dev and a public read-only planner.
  const corsOrigin = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
    : true;
  app.register(cors, { origin: corsOrigin });

  app.get('/health', async () => ({
    status: 'ok',
    machines: store.size,
    routing: { provider: routing.name, isRoadRouting: routing.isRoadRouting },
  }));

  app.get('/retailers', async () => ({ retailers: store.retailers() }));

  app.get<{
    Querystring: { lat: number; lng: number; radiusMeters: number; limit: number };
  }>('/machines/near', { schema: { querystring: nearQuerySchema } }, async (req) => {
    const { lat, lng, radiusMeters, limit } = req.query;
    const hits = store.near({ lat, lng }, radiusMeters, limit);
    return {
      count: hits.length,
      machines: hits.map((h) => ({
        id: h.machine.id,
        name: h.machine.name,
        retailer: h.machine.retailer,
        city: h.machine.city,
        stateProvince: h.machine.stateProvince,
        lat: h.machine.lat,
        lng: h.machine.lng,
        distanceMeters: Math.round(h.distanceMeters),
      })),
    };
  });

  app.post<{ Body: PlanRequest }>(
    '/plan',
    { schema: { body: planBodySchema } },
    async (req) => planCorridorRoute(routing, store, req.body),
  );

  // Route through an explicit, already-ordered set of waypoints. Used by the
  // web planner after the user manually adds, removes, or reorders stops.
  app.post<{ Body: { points: Array<{ lat: number; lng: number }> } }>(
    '/route',
    { schema: { body: routeBodySchema } },
    async (req) => {
      const waypoints: LngLat[] = req.body.points.map((p) => [p.lng, p.lat]);
      const result = await routing.route(waypoints);
      return {
        distanceMeters: Math.round(result.distanceMeters),
        durationSeconds: Math.round(result.durationSeconds),
        routeGeometry: result.coordinates,
        routing: { provider: routing.name, isRoadRouting: routing.isRoadRouting },
      };
    },
  );

  // Universal delivery: GPX export + canonical map deep links.
  registerShareRoutes(app, { routing });

  return app;
}
