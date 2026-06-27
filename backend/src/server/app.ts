import Fastify, { type FastifyInstance } from 'fastify';
import type { MachineStore } from '../catalog/machineStore';
import type { RoutingProvider } from '../routing/types';
import { planCorridorRoute } from '../planner/corridor';
import type { PlanRequest } from '../planner/types';

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

  app.get('/health', async () => ({
    status: 'ok',
    machines: store.size,
    routing: { provider: routing.name, isRoadRouting: routing.isRoadRouting },
  }));

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

  return app;
}
